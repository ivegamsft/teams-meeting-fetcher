// Continuous polling script - watches for meetings and processes them
const { spawn } = require('child_process');
const path = require('path');

const POLL_INTERVAL = 30000; // 30 seconds
let isRunning = false;

function timestamp() {
  return new Date().toLocaleTimeString();
}

function runScript(scriptName) {
  return new Promise((resolve) => {
    console.log(`\n[${timestamp()}] Running ${scriptName}...`);
    const proc = spawn('node', [path.join(__dirname, scriptName)], {
      stdio: 'inherit',
      cwd: __dirname,
    });

    proc.on('close', (code) => {
      resolve(code);
    });

    proc.on('error', (err) => {
      console.error(`[${timestamp()}] Error running ${scriptName}:`, err.message);
      resolve(1);
    });
  });
}

async function pollCycle() {
  if (isRunning) return;
  isRunning = true;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${timestamp()}] 🔄 Starting poll cycle...`);
  console.log(`${'='.repeat(60)}`);

  // Step 1: Poll for meetings
  await runScript('2-poll-meetings.js');

  // Step 2: Check status
  await runScript('3-check-status.js');

  // Step 3: Get transcripts
  await runScript('4-get-transcript.js');

  console.log(`\n[${timestamp()}] ✅ Cycle complete. Next poll in ${POLL_INTERVAL / 1000}s...`);
  isRunning = false;
}

console.log('🚀 Starting continuous meeting monitor...');
console.log(`⏱️  Polling every ${POLL_INTERVAL / 1000} seconds`);
console.log(`🛑 Press Ctrl+C to stop`);
console.log('');

// Run immediately
pollCycle();

// Then run every interval
const intervalId = setInterval(pollCycle, POLL_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping monitor...');
  clearInterval(intervalId);
  process.exit(0);
});
