const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const pino = require('pino');
const readline = require('readline');

const SESSION_FOLDER = './session';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getSession() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║ 🔐 MEGA MIND SESSION GENERATOR v3.0               ║
║   Fixed QR & Pairing Code Authentication          ║
╚═══════════════════════════════════════════════════╝
`);

  // Clean previous session
  await fs.remove(SESSION_FOLDER);
  await fs.ensureDir(SESSION_FOLDER);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`📱 WhatsApp Web Version: v${version.join('.')} ${isLatest ? '(Latest)' : ''}\n`);

  // Ask for authentication method
  console.log('Choose authentication method:');
  console.log('1. QR Code (Scan with phone)');
  console.log('2. Pairing Code (8-digit code)');
  console.log('');
  
  const choice = await question('Enter choice (1 or 2): ');
  const usePairingCode = choice.trim() === '2';
  
  let phoneNumber = '';
  
  if (usePairingCode) {
    console.log('\n📞 Enter phone number in international format:');
    console.log('   Examples: +14155552671 (US), +447911123456 (UK), +919876543210 (India)');
    const input = await question('Phone number: ');
    
    // Remove any spaces, dashes, or existing plus signs for internal processing
    const cleaned = input.replace(/[\s\-\+]/g, '');
    
    // Validate (should be digits only now, 10-15 digits)
    if (!cleaned.match(/^\d{10,15}$/)) {
      console.error('❌ Invalid phone number. Please use format: +1234567890');
      rl.close();
      process.exit(1);
    }
    
    // Store with + for display, without for pairing code
    phoneNumber = cleaned;
    console.log(`\n✓ Using number: +${phoneNumber}\n`);
  }

  // CRITICAL: Use proper browser config for pairing code
  // Pairing codes require a desktop browser configuration
  const browserConfig = usePairingCode 
    ? Browsers.macOS('Chrome')  // Required for pairing code: ['macOS', 'Chrome', '10.15.7']
    : ['MEGA MIND', 'Chrome', '3.0.0'];

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !usePairingCode, // Only QR if not using pairing
    auth: state,
    browser: browserConfig,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000, // 60 seconds timeout
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    shouldIgnoreJid: jid => jid === 'status@broadcast'
  });

  let pairingCodeRequested = false;

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // CRITICAL: Request pairing code ONLY when connection is "connecting" or QR is available
    // This ensures the socket is ready to accept the request
    if (usePairingCode && !pairingCodeRequested && !state.creds.registered) {
      if (connection === 'connecting' || qr) {
        pairingCodeRequested = true;
        
        try {
          console.log('⏳ Requesting pairing code from WhatsApp...');
          
          // Small delay to ensure socket is fully ready
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // CRITICAL: Phone number must NOT have + sign for requestPairingCode
          const code = await sock.requestPairingCode(phoneNumber);
          
          console.log('\n═══════════════════════════════════════════════════');
          console.log('🔢 YOUR PAIRING CODE:');
          console.log('═══════════════════════════════════════════════════');
          console.log(`\n           ${code}\n`);
          console.log('═══════════════════════════════════════════════════');
          console.log('\n📲 How to use:');
          console.log('   1. Open WhatsApp on your phone');
          console.log('   2. Go to Settings → Linked Devices');
          console.log('   3. Tap "Link with phone number instead"');
          console.log('   4. Enter the 8-digit code above');
          console.log('\n⏱️  Code expires in 2 minutes!\n');
          
        } catch (err) {
          console.error('\n❌ Pairing code error:', err.message);
          console.error('Full error:', err);
          
          if (err.message.includes('Connection Closed')) {
            console.log('\n💡 Tips:');
            console.log('   - Make sure your phone has internet connection');
            console.log('   - Try using QR code method instead');
            console.log('   - Restart and try again');
          }
          
          rl.close();
          process.exit(1);
        }
      }
    }

    // Show QR code instructions
    if (qr && !usePairingCode) {
      console.log('\n📲 Scan this QR code with WhatsApp:');
      console.log('   WhatsApp → Settings → Linked Devices → Link a Device\n');
    }

    // Successfully connected
    if (connection === 'open') {
      console.log('\n✅ Connected successfully!\n');
      console.log(`👤 User: ${sock.user?.id || 'Unknown'}`);
      console.log(`📱 Name: ${sock.user?.name || 'Unknown'}\n`);
      
      rl.close();

      // Wait for credentials to be saved
      await new Promise(r => setTimeout(r, 3000));

      try {
        // Read and encode credentials
        const credsPath = `${SESSION_FOLDER}/creds.json`;
        
        if (!await fs.pathExists(credsPath)) {
          throw new Error('Credentials file not found. Waiting longer...');
        }
        
        const creds = await fs.readFile(credsPath, 'utf8');
        const sessionId = Buffer.from(creds).toString('base64');

        console.log('═══════════════════════════════════════════════════');
        console.log('🔑 YOUR SESSION ID (COPY ENTIRE STRING):');
        console.log('═══════════════════════════════════════════════════\n');
        console.log(sessionId);
        console.log('\n═══════════════════════════════════════════════════');
        console.log('\n📋 Add to set.js:');
        console.log(`SESSION_ID: "${sessionId.substring(0, 50)}..."`);
        console.log('\n💾 Saved to SESSION_ID.txt');
        console.log('⚠️  Keep this secure! Anyone with this can control your bot.\n');

        await fs.writeFile('SESSION_ID.txt', sessionId);
        
        // Graceful exit
        setTimeout(() => {
          console.log('👋 Session generated successfully. Exiting...');
          process.exit(0);
        }, 5000);

      } catch (err) {
        console.error('❌ Error saving session:', err.message);
        // Retry once
        setTimeout(async () => {
          try {
            const creds = await fs.readFile(`${SESSION_FOLDER}/creds.json`, 'utf8');
            const sessionId = Buffer.from(creds).toString('base64');
            await fs.writeFile('SESSION_ID.txt', sessionId);
            console.log('✅ Session saved on retry');
            process.exit(0);
          } catch (e) {
            console.error('Failed to save session:', e.message);
            process.exit(1);
          }
        }, 3000);
      }
    }

    // Handle disconnection
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || '';
      
      console.log(`\n⚠️  Connection closed: ${DisconnectReason[statusCode] || statusCode || 'Unknown'}`);
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Please restart and scan again.');
        rl.close();
        process.exit(1);
      }
      
      if (statusCode === DisconnectReason.restartRequired) {
        console.log('🔄 Restart required, reconnecting...');
        // Don't exit, let it reconnect naturally
        return;
      }
      
      if (statusCode === 405) {
        console.log('❌ Error 405: Method not allowed. Try QR code instead.');
        rl.close();
        process.exit(1);
      }
      
      if (statusCode === 428) {
        console.log('❌ Connection closed prematurely. Check your internet connection.');
      }
    }
  });

  // Save credentials when updated
  sock.ev.on('creds.update', async (creds) => {
    try {
      await saveCreds();
      console.log('💾 Credentials updated');
    } catch (err) {
      console.error('Error saving credentials:', err.message);
    }
  });

  // Handle socket errors
  sock.ev.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Interrupted by user');
  rl.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  rl.close();
  process.exit(1);
});

// Start
getSession().catch(err => {
  console.error('Fatal error:', err);
  rl.close();
  process.exit(1);
});
