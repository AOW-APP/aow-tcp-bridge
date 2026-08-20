import { supabase } from '../supabase.ts';

const BASE_URL = 'http://localhost:3000';
const AUDIT_IMEI = '888888888888888';
const TCP_PORT = 9001;
const MOCK_OPERATOR_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

async function runAuditTest() {
  console.log(`[Test Audit] Starting audit and acknowledgment integration test...`);

  // 1. Create a command with operator UUID while the device is offline
  console.log(`[Test Audit] 1. Queueing command 'UPLOAD,30' with createdBy operator...`);
  const queueRes = await fetch(`${BASE_URL}/api/devices/${AUDIT_IMEI}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      command: 'UPLOAD', 
      payload: '30',
      createdBy: MOCK_OPERATOR_UUID 
    })
  });

  if (!queueRes.ok) {
    const errorText = await queueRes.text();
    console.error(`[Test Audit] Failed to queue command:`, errorText);
    process.exit(1);
  }

  const queueData = await queueRes.json() as any;
  console.log(`[Test Audit] Command queued successfully:`, queueData);

  // 2. Connect device simulator to TCP server
  console.log(`[Test Audit] 2. Connecting simulated device...`);
  
  const auditPromise = new Promise<void>((resolve) => {
    Bun.connect({
      hostname: '0.0.0.0',
      port: TCP_PORT,
      socket: {
        open(socket) {
          // Send initial LK heartbeat to register connection
          const frame = `[3G*${AUDIT_IMEI}*000C*LK,90,80,500]`;
          socket.write(frame);
        },
        data(socket, data) {
          const dataStr = data.toString();
          console.log(`[Test Audit] Simulated device received raw data: ${dataStr.trim()}`);
          
          // If we received the command "UPLOAD,30" from the server, reply with an ACK to test auto-acknowledgment!
          if (dataStr.includes('UPLOAD,30')) {
            console.log(`[Test Audit] Simulated device sending back UPLOAD ACK...`);
            // The watch replies with the command name as type
            const replyFrame = `[3G*${AUDIT_IMEI}*000A*UPLOAD,ACK]`;
            socket.write(replyFrame);
            
            // Wait a bit, then resolve and close
            setTimeout(() => {
              socket.end();
              resolve();
            }, 1500);
          }
        },
        error(socket, err) {
          console.error(`[Test Audit] Socket error:`, err.message);
        }
      }
    });
  });

  await auditPromise;

  // 3. Verify database record has been updated with audit details and acknowledged_at timestamp
  console.log(`[Test Audit] 3. Verifying database command audit logs...`);
  
  const { data: cmdRecord, error: dbErr } = await supabase
    .from('device_commands')
    .select('*')
    .eq('id', queueData.commandId)
    .single();

  if (dbErr) {
    console.error(`[Test Audit] Error querying db for command:`, dbErr.message);
  } else {
    console.log(`[Test Audit] DB Command State:`, {
      id: cmdRecord.id,
      command: cmdRecord.command,
      payload: cmdRecord.payload,
      status: cmdRecord.status,
      created_by: cmdRecord.created_by,
      client_ip: cmdRecord.client_ip,
      sent_at: cmdRecord.sent_at,
      acknowledged_at: cmdRecord.acknowledged_at
    });

    const isSuccess = 
      cmdRecord.status === 'sent' && 
      cmdRecord.created_by === MOCK_OPERATOR_UUID && 
      cmdRecord.client_ip !== null &&
      cmdRecord.acknowledged_at !== null;

    if (isSuccess) {
      console.log(`\n🎉 [Test Audit] SUCCESS! Command auditing and auto-acknowledgment logic works 100%!`);
    } else {
      console.error(`\n❌ [Test Audit] FAILED! Missing audit values or acknowledgment timestamp.`);
    }
  }

  // Cleanup
  await supabase.from('device_commands').delete().eq('id', queueData.commandId);
}

runAuditTest().catch((err) => {
  console.error('[Test Audit] Fatal error:', err);
});
