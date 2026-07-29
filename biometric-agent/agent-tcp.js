// agent-tcp.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const net = require('net');

const STATE_FILE = path.join(__dirname, 'last-sync.json');
const DEVICE_IP = process.env.DEVICE_IP;
const DEVICE_PORT = Number(process.env.DEVICE_PORT || 5005);
const API_BASE_URL = process.env.API_BASE_URL;
const WEBHOOK_SECRET = process.env.BIOMETRIC_WEBHOOK_SECRET;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30000);

function readLastSyncTime() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return new Date(JSON.parse(raw).lastSyncTime);
  } catch {
    return new Date(0);
  }
}

function writeLastSyncTime(date) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastSyncTime: date.toISOString() }, null, 2));
}

// Simple TCP connection to read attendance data
function getAttendanceViaTCP(ip, port) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';
    
    socket.setTimeout(10000);
    
    socket.on('connect', () => {
      console.log('  ✅ TCP Connected to device');
      // Send command to get attendance data
      // This is a simplified command - actual protocol may vary
      socket.write('GET /attendance\r\n');
    });
    
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    socket.on('end', () => {
      socket.destroy();
      try {
        // Parse the response
        const logs = parseAttendanceData(data);
        resolve(logs);
      } catch (e) {
        reject(e);
      }
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
    
    socket.connect(port, ip);
  });
}

function parseAttendanceData(data) {
  // Parse the data from device
  // This is a placeholder - actual parsing depends on device format
  const logs = [];
  const lines = data.split('\n');
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        // Try to parse as JSON first
        const parsed = JSON.parse(line);
        logs.push(parsed);
      } catch (e) {
        // Parse as CSV or custom format
        const parts = line.split(',');
        if (parts.length >= 3) {
          logs.push({
            userId: parts[0].trim(),
            attTime: parts[1].trim(),
            status: parts[2].trim()
          });
        }
      }
    }
  }
  
  return logs;
}

async function pollDevice() {
  const lastSync = readLastSyncTime();
  let newestPunch = lastSync;

  try {
    console.log(`[${new Date().toISOString()}] Connecting to C101W device at ${DEVICE_IP}:${DEVICE_PORT}...`);

    // Try to get attendance via TCP
    const logs = await getAttendanceViaTCP(DEVICE_IP, DEVICE_PORT);
    console.log(`  📊 Found ${logs.length} total records`);

    // Filter new logs
    const newLogs = logs.filter(log => {
      const punchTime = new Date(log.attTime || log.time || log.timestamp);
      return punchTime > lastSync;
    });

    console.log(`  🆕 Found ${newLogs.length} new punch(es)`);

    for (const log of newLogs) {
      const punchTime = new Date(log.attTime || log.time || log.timestamp);
      const biometricUserId = String(log.userId || log.uid || log.pin);

      if (!biometricUserId || biometricUserId === 'undefined') {
        console.warn(`  ⚠️ Skipping punch with missing user ID`);
        continue;
      }

      const direction = log.status === 'OUT' || log.status === '1' ? 'CHECK_OUT' : 'CHECK_IN';

      try {
        await axios.post(`${API_BASE_URL}/attendance/biometric-webhook`, {
          secret: WEBHOOK_SECRET,
          biometricUserId,
          punchTime: punchTime.toISOString(),
          deviceId: DEVICE_IP,
          direction: direction
        });
        console.log(`  ✅ ${biometricUserId} - ${punchTime.toISOString()} - ${direction}`);
      } catch (err) {
        console.error(`  ❌ Failed for ${biometricUserId}:`, err.response?.data || err.message);
      }

      if (punchTime > newestPunch) newestPunch = punchTime;
    }

    if (newestPunch > lastSync) {
      writeLastSyncTime(newestPunch);
      console.log(`  💾 Updated last sync time to ${newestPunch.toISOString()}`);
    }

  } catch (err) {
    console.error('  ❌ Error:', err.message);
    console.log('  💡 Trying alternative method...');
  }
}

async function main() {
  if (!DEVICE_IP || !API_BASE_URL || !WEBHOOK_SECRET) {
    console.error('Missing environment variables. Check .env file.');
    process.exit(1);
  }

  console.log(`\n🔍 Biometric Agent Starting...`);
  console.log(`📍 Device: ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log(`🔗 API: ${API_BASE_URL}`);
  console.log(`⏱️  Polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`─────────────────────────────────────────────\n`);

  await pollDevice();
  setInterval(pollDevice, POLL_INTERVAL_MS);
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

main();