const { 
  default: makeWASocket, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const pino = require('pino');

const SESSION_FOLDER = './session';

async function getSession() {
  console.log(`
╔═══════════════════════════════════════╗
║  🔐 MEGA MIND SESSION GENERATOR       ║
╚═══════════════════════════════════════╝
`);

  await fs.remove(SESSION_FOLDER);
  await fs.ensureDir(SESSION_FOLDER);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📱 WhatsApp Web v${version.join('.')}\n`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['MEGA MIND', 'Chrome', '3.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      console.log('\n📲 Scan QR code with WhatsApp\n');
    }

    if (connection === 'open') {
      console.log('\n✅ Connected!\n');
      
      await new Promise(r => setTimeout(r, 2000));
      
      try {
        const creds = await fs.readFile(`${SESSION_FOLDER}/creds.json`, 'utf8');
        const sessionId = Buffer.from(creds).toString('base64');
        
        console.log('═══════════════════════════════════════════════════');
        console.log('🔑 YOUR SESSION ID (COPY THIS):');
        console.log('═══════════════════════════════════════════════════\n');
        console.log(sessionId);
        console.log('\n═══════════════════════════════════════════════════');
        console.log('\n📋 Add to set.js:');
        console.log('SESSION_ID: "paste_here"');
        console.log('\n💾 Saved to SESSION_ID.txt\n');
        
        await fs.writeFile('SESSION_ID.txt', sessionId);
        
      } catch (err) {
        console.error('Error:', err.message);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

getSession().catch(console.error);

