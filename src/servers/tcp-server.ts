import type { BunDeviceSocket, DeviceSessionData } from "../types/session.ts";
import { sessionStore } from "../tcp/sessionStore.ts";
import { SeTrackerParser } from "../tcp/protocols/setracker.parser.ts";
import { ProtocolRouter } from "../tcp/protocol.router.ts";

// TCP Port and Host configuration from environment variables
const TCP_PORT = parseInt(Bun.env.SOCKET_PORT || '9001', 10);
const TCP_HOST = Bun.env.SOCKET_HOST || '0.0.0.0';

// Active socket buffer registry using raw Uint8Arrays for zero-copy memory overhead
const socketBuffers = new Map<BunDeviceSocket, Uint8Array>();

// Instantiate the default parser strategy
const parser = new SeTrackerParser();

export function startTcpServer() {
  console.log(`[System] Initializing AoW IoT Bridge TCP Server...`);

  const tcpServer = Bun.listen<DeviceSessionData>({
    hostname: TCP_HOST,
    port: TCP_PORT,
    socket: {
      open(socket) {
        console.log(`[TCP Server] Socket opened from device.`);
        // Initialize the standard device session data context
        socket.data = {
          buffer: "",
          connectedAt: new Date(),
          lastHeartbeat: new Date(),
        };
      },
      async data(socket, data) {
        // Retrieve accumulated buffer or initialize an empty Uint8Array
        let buffer = socketBuffers.get(socket) || new Uint8Array(0);
        
        // Accumulate binary chunk (Bun/Node Buffer.concat is highly optimized)
        buffer = Buffer.concat([buffer, data]);

        while (buffer.length > 0) {
          // Feed the buffer to the parser strategy
          const { consumedBytes, event } = parser.parseBuffer(buffer);

          if (consumedBytes > 0) {
            // Slice buffer past the parsed frame
            buffer = buffer.subarray(consumedBytes);

            // If a valid telemetry event was successfully parsed, route it to services
            if (event) {
              try {
                // Route event asynchronously to avoid blocking the main read loop
                await ProtocolRouter.route(socket, event);
                
                const readOnly = Bun.env.SOCKET_READ_ONLY === 'true';
                if (!readOnly) {
                  // If the watch sent an ACK-generating command, reply back immediately
                  if (event.commandType === 'LK') {
                    const replyFrame = parser.formatCommand(event.imei, 'LK,ACK');
                    socket.write(replyFrame);
                    console.log(`[TCP Server] 📤 Sent LK ACK to ${event.imei}`);
                  } 
                  else if (event.commandType === 'UD' || event.commandType === 'UD2') {
                    const replyFrame = parser.formatCommand(event.imei, `${event.commandType},ACK`);
                    socket.write(replyFrame);
                    console.log(`[TCP Server] 📤 Sent location ACK (${event.commandType}) to ${event.imei}`);
                  } 
                  else if (event.commandType === 'AL') {
                    const replyFrame = parser.formatCommand(event.imei, 'AL,ACK');
                    socket.write(replyFrame);
                    console.log(`[TCP Server] 🚨 📤 Sent SOS ALERT ACK (AL) to ${event.imei}`);
                  }
                } else {
                  console.log(`[TCP Server] Read-only mode active. Suppressed ACK reply downstream.`);
                }
              } catch (error: any) {
                console.error(`[TCP Server] Error routing event for IMEI ${event.imei}:`, error.message);
              }
            }
          } else {
            // Wait for more data chunks to arrive
            break;
          }
        }

        // Save back residual pointer buffer
        socketBuffers.set(socket, buffer);
      },
      close(socket) {
        // Clean up active session registration
        sessionStore.remove(socket);
        socketBuffers.delete(socket);
        console.log(`[TCP Server] Socket closed.`);
      },
      error(socket, error) {
        // Clean up active session registration
        sessionStore.remove(socket);
        socketBuffers.delete(socket);
        console.error(`[TCP Server] Socket error:`, error.message);
      },
    },
  });

  console.log(`[TCP Server] Listening for IoT connections on ${tcpServer.hostname}:${tcpServer.port}`);

  // Periodic sweeper task to disconnect inactive sockets (checks every 60s)
  const STALE_CHECK_INTERVAL_MS = 60 * 1000;
  const MAX_IDLE_TIMEOUT_MS = parseInt(Bun.env.SOCKET_IDLE_MS || '300000', 10); // Defaults to 5 minutes (300,000ms)

  setInterval(() => {
    sessionStore.cleanupStaleSessions(MAX_IDLE_TIMEOUT_MS);
  }, STALE_CHECK_INTERVAL_MS);

  return tcpServer;
}
