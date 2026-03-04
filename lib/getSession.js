const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const pino = require('pino');
const readline = require('readline');

const SESSION_FOLDER = './session';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getSession() {
  console.log(`
╔═══════════════════════════════════════╗
║ 🔐 MEGA MIND SESSION GENERATOR v2.0   ║
║   Supports QR Code & Pairing Code     ║
╚═══════════════════════════════════════╝
`);

  // Clean previous session
  await fs.remove(SESSION_FOLDER);
  await fs.ensureDir(SESSION_FOLDER);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`📱 WhatsApp Web Version: v${version.join('.')} ${isLatest ? '(Latest)' : ''}\n`);

  // Ask user for preferred method
  console.log('Choose authentication method:');
  console.log('1. QR Code (Recommended - Most Reliable)');
  console.log('2. Pairing Code (8-digit code)\n');
  
  const choice = await question('Enter choice (1 or 2): ');
  const usePairingCode = choice.trim() === '2';

  let phoneNumber = '';
  
  if (usePairingCode) {
    console.log('\n📞 Enter phone number with country code (e.g., +1234567890):');
    phoneNumber = await question('Phone: ');
    
    // Validate phone number format
    if (!phoneNumber.match(/^\+[1-9]\d{1,14}$/)) {
      console.error('❌ Invalid phone number format. Must start with + followed by country code.');
      console.log('Example: +14155552671 (US), +447911123456 (UK)');
      process.exit(1);
    }
  }

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !usePairingCode, // Only print QR if not using pairing code
    auth: state,
    browser: ['MEGA MIND', 'Chrome', '3.0.0'],
    markOnlineOnConnect: false
  });

  // Handle pairing code request
  if (usePairingCode && !state.creds.registered) {
    try {
      console.log('\n⏳ Requesting pairing code...');
      
      // Wait for socket to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const code = await sock.requestPairingCode(phoneNumber);
      console.log('\n═══════════════════════════════════════════════════');
      console.log('🔢 YOUR PAIRING CODE:');
      console.log('═══════════════════════════════════════════════════');
      console.log(`\n        ${code}\n`);
      console.log('═══════════════════════════════════════════════════');
      console.log('📲 Open WhatsApp > Settings > Linked Devices > Link with phone number');
      console.log('⚠️  Code expires in 2 minutes!\n');
      
    } catch (err) {
      console.error('❌ Pairing code error:', err.message);
      console.log('💡 Try using QR Code method instead (Option 1)');
      process.exit(1);
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !usePairingCode) {
      console.log('\n📲 Scan QR code with WhatsApp');
      console.log('   WhatsApp > Settings > Linked Devices > Link a Device\n');
    }

    if (connection === 'open') {
      console.log('\n✅ Connected successfully!\n');
      
      // Close readline
      rl.close();

      await new Promise(r => setTimeout(r, 2000));

      try {
        const creds = await fs.readFile(`${SESSION_FOLDER}/creds.json`, 'utf8');
        const sessionId = Buffer.from(creds).toString('base64');

        console.log('═══════════════════════════════════════════════════');
        console.log('🔑 YOUR SESSION ID (COPY THIS ENTIRE STRING):');
        console.log('═══════════════════════════════════════════════════\n');
        console.log(sessionId);
        console.log('\n═══════════════════════════════════════════════════');
        console.log('\n📋 Add to set.js or .env:');
        console.log('SESSION_ID: "' + sessionId.substring(0, 50) + '..."');
        console.log('\n💾 Also saved to SESSION_ID.txt\n');
        console.log('⚠️  Keep this secure! Anyone with this ID can control your bot.\n');

        await fs.writeFile('SESSION_ID.txt', sessionId);
        
        // Keep process alive briefly to ensure save
        setTimeout(() => process.exit(0), 5000);

      } catch (err) {
        console.error('❌ Error generating session ID:', err.message);
        process.exit(1);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      if (!shouldReconnect) {
        console.log('❌ Connection closed. Please restart and scan again.');
        rl.close();
        process.exit(1);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  
  // Handle errors
  sock.ev.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  rl.close();
  process.exit(0);
});

getSession().catch(err => {
  console.error('Fatal error:', err);
  rl.close();
  process.exit(1);
});
