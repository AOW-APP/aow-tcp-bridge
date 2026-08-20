import { supabase } from '../supabase.ts';

const BASE_URL = 'http://localhost:3000';
const OFFLINE_IMEI = '999999999999999';
const TCP_PORT = 9001;

async function runOfflineQueueTest() {
  console.log(`[Test Queue] Starting store-and-forward command test...`);

  // 1. Send command while the device is completely offline
  console.log(`[Test Queue] 1. Sending command 'RESET' to offline device ${OFFLINE_IMEI}...`);
  const queueRes = await fetch(`${BASE_URL}/api/devices/${OFFLINE_IMEI}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'RESET' })
  });

  if (!queueRes.ok) {
    const errorText = await queueRes.text();
    console.error(`[Test Queue] Failed to queue command:`, errorText);
    process.exit(1);
  }

  const queueData = await queueRes.json() as any;
  console.log(`[Test Queue] Command queued successfully:`, queueData);
  
  if (queueData.delivery !== 'queued_offline') {
    console.error(`[Test Queue] Expected 'queued_offline' delivery status, got:`, queueData.delivery);
    process.exit(1);
  }

  // 2. Connect device simulator to TCP server to trigger registration and check if it pulls the pending command
  console.log(`[Test Queue] 2. Simulating device connection to TCP server...`);
  
  let commandReceivedPromise = new Promise<string>((resolve) => {
    Bun.connect({
      hostname: '0.0.0.0',
      port: TCP_PORT,
      socket: {
        open(socket) {
          // Send initial LK heartbeat to register connection
          const manufacturer = '3G';
          const payload = 'LK,90,80,500';
          const frame = `[${manufacturer}*${OFFLINE_IMEI}*000C*${payload}]`;
          socket.write(frame);
          console.log(`[Test Queue] Simulated device connected and sent LK heartbeat.`);
        },
        data(socket, data) {
          const dataStr = data.toString();
          console.log(`[Test Queue] Simulated device received raw data: ${dataStr.trim()}`);
          if (dataStr.includes('RESET')) {
            resolve(dataStr);
            socket.end(); // close socket
          }
        },
        error(socket, err) {
          console.error(`[Test Queue] Socket error:`, err.message);
        }
      }
    });
  });

  const rawFrameReceived = await commandReceivedPromise;

  // 3. Verify database record has been marked as 'sent'
  console.log(`[Test Queue] 3. Verifying database command status...`);
  await new Promise((resolve) => setTimeout(resolve, 3000)); // wait 3 seconds for database update
  
  const { data: cmdRecord, error: dbErr } = await supabase
    .from('device_commands')
    .select('*')
    .eq('id', queueData.commandId)
    .single();

  if (dbErr) {
    console.error(`[Test Queue] Error querying db for command:`, dbErr.message);
  } else {
    console.log(`[Test Queue] DB Command State:`, {
      id: cmdRecord.id,
      command: cmdRecord.command,
      status: cmdRecord.status, // Should be 'sent'
      sent_at: cmdRecord.sent_at
    });

    if (cmdRecord.status === 'sent' && rawFrameReceived.includes('RESET')) {
      console.log(`\n🎉 [Test Queue] SUCCESS! Store-and-forward command queue works perfectly!`);
    } else {
      console.error(`\n❌ [Test Queue] FAILED! Command status: ${cmdRecord.status}, expected: 'sent'.`);
    }
  }

  // Cleanup commented out for manual inspection
  // await supabase.from('device_commands').delete().eq('id', queueData.commandId);
}

runOfflineQueueTest().catch((err) => {
  console.error('[Test Queue] Fatal error:', err);
});
