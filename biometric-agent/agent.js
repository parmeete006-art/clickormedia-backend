// agent.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const net = require('net');
const ZKTeco = require('zkteco');

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

// Test if device is reachable
async function testDeviceConnection(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

async function pollDevice() {
  const lastSync = readLastSyncTime();
  let newestPunch = lastSync;
  let device = null;

  try {
    console.log(`[${new Date().toISOString()}] Connecting to C101W device at ${DEVICE_IP}:${DEVICE_PORT}...`);

    // Test if device is reachable
    const isReachable = await testDeviceConnection(DEVICE_IP, DEVICE_PORT);
    if (!isReachable) {
      console.log(`  ⚠️ Device is not reachable on port ${DEVICE_PORT}`);
      return;
    }
    console.log('  ✅ Device is reachable');

    // Create device connection with zkteco
    device = new ZKTeco(DEVICE_IP, DEVICE_PORT);
    
    console.log('  🔄 Attempting to connect...');
    await device.connect();
    console.log('  ✅ Connected to device');

    // Get device info
    try {
      const info = await device.getInfo();
      console.log(`  📋 Device: ${info.serialNumber || info.model || 'Unknown'}`);
    } catch (e) {
      console.log('  ⚠️ Could not get device info');
    }

    // Get attendance logs
    console.log('  🔄 Fetching attendance logs...');
    const logs = await device.getAttendances();
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

      if (!biometricUserId || biometricUserId === 'undefined' || biometricUserId === 'null') {
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

    await device.disconnect();
    console.log('  ✅ Disconnected from device');

  } catch (err) {
    console.error('  ❌ Error connecting to device:', err.message);
    
    if (device) {
      try {
        await device.disconnect();
      } catch (e) {
        // Ignore
      }
    }
  }
}

async function main() {
  if (!DEVICE_IP || !API_BASE_URL || !WEBHOOK_SECRET) {
    console.error('❌ Missing environment variables. Check .env file.');
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

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
});

main();