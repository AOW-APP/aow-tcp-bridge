import { supabase } from '../supabase.ts';
import { SimulatorManager } from '../simulator-manager.ts';
import { sessionStore } from '../tcp/sessionStore.ts';

const HTTP_PORT = parseInt(Bun.env.HTTP_PORT || '3000', 10);

interface CreateSimulatorPayload {
  imei: string;
  alias: string;
}

interface TriggerEventPayload {
  eventType: string;
}

interface DeviceCommandPayload {
  command: string;
  payload?: string;
  createdBy?: string;
}

export function startWebServer() {
  console.log(`[System] Initializing HTTP Server (Web Panel) AoW IoT Bridge...`);

  const webServer = Bun.serve({
    port: HTTP_PORT,
    async fetch(req, server) {
      const url = new URL(req.url);

      // Serve static HTML panel
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const file = Bun.file('./src/panel.html');
        return new Response(file, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // API: List simulators
      if (url.pathname === '/api/simulators' && req.method === 'GET') {
        return Response.json(SimulatorManager.getSimulators());
      }

      // API: Create simulator
      if (url.pathname === '/api/simulators' && req.method === 'POST') {
        try {
          const body = await req.json() as CreateSimulatorPayload;
          SimulatorManager.createSimulator(body.imei, body.alias);
          return Response.json({ status: 'ok' });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 400 });
        }
      }

      // API: Conectar/Desconectar (Toggle)
      if (url.pathname.match(/\/api\/simulators\/[0-9]{15}\/toggle/) && req.method === 'POST') {
        const imei = url.pathname.split('/')[3];
        SimulatorManager.toggleSimulator(imei);
        return Response.json({ status: 'ok' });
      }

      // API: Eliminar simulador
      if (url.pathname.match(/\/api\/simulators\/[0-9]{15}/) && req.method === 'DELETE') {
        const imei = url.pathname.split('/')[3];
        SimulatorManager.deleteSimulator(imei);
        return Response.json({ status: 'ok' });
      }

      // API: Trigger manual event from simulator to server
      if (url.pathname.match(/\/api\/simulators\/[0-9]{15}\/send/) && req.method === 'POST') {
        const imei = url.pathname.split('/')[3];
        try {
          const body = await req.json() as TriggerEventPayload;
          SimulatorManager.sendEvent(imei, body.eventType);
          return Response.json({ status: 'ok' });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 400 });
        }
      }

      // API: Send command from server downstream to a real connected smartwatch socket
      if (url.pathname.match(/\/api\/devices\/[0-9]{15}\/command/) && req.method === 'POST') {
        const imei = url.pathname.split('/')[3];
        try {
          const readOnly = Bun.env.SOCKET_READ_ONLY === 'true';
          if (readOnly) {
            return new Response(JSON.stringify({ error: 'Server is in read-only mode. Downstream commands are disabled.' }), { status: 403 });
          }

          const body = await req.json() as DeviceCommandPayload;
          const { command, payload, createdBy } = body;

          if (!command) {
            return new Response(JSON.stringify({ error: 'Missing required field "command"' }), { status: 400 });
          }

          // Extract client IP address for security audit logs
          const clientIp = req.headers.get('x-forwarded-for') || server.requestIP(req)?.address || '127.0.0.1';

          // 1. Persist the command to database queue as 'pending'
          const { data: dbData, error: dbErr } = await supabase
            .from('device_commands')
            .insert({
              imei,
              command,
              payload: payload || null,
              status: 'pending',
              created_by: createdBy || null,
              client_ip: clientIp
            })
            .select('id')
            .single();

          if (dbErr) throw dbErr;
          const commandId = dbData.id;

          // 2. Attempt immediate delivery downstream if the device is currently online
          let delivered = false;
          if (sessionStore.isOnline(imei)) {
            const commandContent = payload ? `${command},${payload}` : command;
            const sent = sessionStore.sendCommand(imei, commandContent);
            if (sent) {
              await supabase
                .from('device_commands')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('id', commandId);
              delivered = true;
              console.log(`[Web Server] Command ID ${commandId} ('${commandContent}') sent immediately to online device ${imei}.`);
            }
          }

          return Response.json({ 
            status: 'ok', 
            commandId, 
            delivery: delivered ? 'delivered_immediately' : 'queued_offline' 
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 400 });
        }
      }

      return new Response('Not Found', { status: 404 });
    }
  });

  console.log(`[Web Server] Web administration panel active at http://localhost:${webServer.port}`);
  return webServer;
}
