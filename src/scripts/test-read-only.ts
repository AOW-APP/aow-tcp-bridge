// Set up env configurations for this test process only
process.env.SOCKET_PORT = '9097';
process.env.SOCKET_READ_ONLY = 'true';

async function runReadOnlyTest() {
  console.log(`[Test Read-Only] Starting isolated read-only TCP server test on port 9097...`);

  // Dynamically import to ensure environment variables are loaded first
  const { startTcpServer } = await import('../servers/tcp-server.ts');

  // Start a local instance of the TCP server
  const server = startTcpServer();

  const testPromise = new Promise<void>((resolve, reject) => {
    let dataReceived = false;

    Bun.connect({
      hostname: '0.0.0.0',
      port: 9097,
      socket: {
        open(socket) {
          // Send initial LK heartbeat
          const frame = `[3G*777777777777777*000C*LK,90,80,500]`;
          socket.write(frame);
          console.log(`[Test Read-Only] Simulated device connected and sent LK heartbeat.`);
        },
        data(socket, data) {
          dataReceived = true;
          console.error(`[Test Read-Only] ❌ Error: Received data back from server:`, data.toString().trim());
          socket.end();
          reject(new Error("Server replied with ACK in read-only mode"));
        },
        error(socket, err) {
          console.error(`[Test Read-Only] Socket error:`, err.message);
        }
      }
    });

    // Wait 2 seconds. If no data was received back, it is a success (ACK was suppressed!)
    setTimeout(() => {
      if (!dataReceived) {
        console.log(`[Test Read-Only] OK: No data received from server (ACK successfully suppressed).`);
        resolve();
      }
    }, 2000);
  });

  try {
    await testPromise;
    console.log(`\n🎉 [Test Read-Only] SUCCESS! Read-only mode works perfectly.`);
  } catch (err: any) {
    console.error(`\n❌ [Test Read-Only] FAILED:`, err.message);
  } finally {
    // Shutdown the test server
    server.stop();
  }
}

runReadOnlyTest().catch((err) => {
  console.error('[Test Read-Only] Fatal error:', err);
});
