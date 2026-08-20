const BASE_URL = 'http://localhost:3000';
const TEST_IMEI = '123456789012345';
const TEST_ALIAS = 'TestWatchSpain';

async function runTest() {
  console.log(`[Test] Starting HTTP-to-TCP command integration test...`);

  // 1. Create and connect the simulated smartwatch via the Web Server API
  console.log(`[Test] 1. Creating simulator for IMEI ${TEST_IMEI}...`);
  const createRes = await fetch(`${BASE_URL}/api/simulators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imei: TEST_IMEI, alias: TEST_ALIAS })
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    console.error(`[Test] Failed to create simulator:`, errorText);
    process.exit(1);
  }
  console.log(`[Test] Simulator created successfully.`);

  // Wait for TCP socket connection and registration to settle
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 2. Send a downstream command from the Web Server to the TCP Socket
  console.log(`[Test] 2. Sending command "FORCE_GPS" downstream to IMEI ${TEST_IMEI}...`);
  const commandRes = await fetch(`${BASE_URL}/api/devices/${TEST_IMEI}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'FORCE_GPS' })
  });

  if (!commandRes.ok) {
    const errorText = await commandRes.text();
    console.error(`[Test] Failed to send command:`, errorText);
  } else {
    console.log(`[Test] Command response:`, await commandRes.json());
  }

  // Wait to observe the TCP server output and the simulator's response log
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 3. Clean up and delete the simulator
  console.log(`[Test] 3. Cleaning up and deleting simulator...`);
  await fetch(`${BASE_URL}/api/simulators/${TEST_IMEI}`, {
    method: 'DELETE'
  });

  console.log(`[Test] Integration test completed.`);
}

runTest().catch((err) => {
  console.error('[Test] Fatal error:', err);
});
