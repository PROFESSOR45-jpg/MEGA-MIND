/**
 * MEGA MIND BOT v3.0.0 - Fixed Authentication
 */

const db = require('./lib/database');
global.db = db;

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const express = require('express');

const config = require('./set.js');
const MegaHandler = require('./lib/mega');
const commands = require('./commands/allCommands');
const AntiBug = require('./lib/antibug');
const StatusReactor = require('./lib/statusReact');
const AutoBlock = require('./lib/autoBlock');
const CommandReactor = require('./lib/commandReactor');

// Colors
const C = {
  r: '\x1b[0m', g: '\x1b[32m', y: '\x1b[33m',
  c: '\x1b[36m', m: '\x1b[35m', w: '\x1b[1m', d: '\x1b[90m', b: '\x1b[34m'
};

const logo = `
${C.m}${C.w}
 ███╗   ███╗███████╗ ██████╗  █████╗ ███╗   ███╗██╗███╗   ██╗██████╗ 
 ████╗ ████║██╔════╝██╔════╝ ██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗
 ██╔████╔██║█████╗  ██║  ███╗███████║██╔████╔██║██║██╔██╗ ██║██║  ██║
 ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║██║╚██╔╝██║██║██║╚██╗██║██║  ██║
 ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██████╔╝
 ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ 
${C.b}                    ██████╗  ██████╗ ████████╗                       
                    ██╔══██╗██╔═══██╗╚══██╔══╝                       
                    ██████╔╝██║   ██║   ██║                          
                    ██╔══██╗██║   ██║   ██║                          
                    ██████╔╝╚██████╔╝   ██║                          
                    ╚═════╝  ╚═════╝    ╚═╝                          
${C.y}
 🔒 ANTI-BUG PROTECTION ENABLED  |  ⚡ COMMAND STATUS REACTIONS: ON
${C.r}
`;

// Keep alive
const app = express();
app.get('/', (req, res) => res.json({
  status: 'alive',
  bot: config.BOT_NAME,
  version: '3.0.0',
  timestamp: new Date().toISOString()
}));
app.listen(process.env.PORT || 3000);

// Restore session
async function restoreSession() {
  if (!config.SESSION_ID) {
    console.log(`${C.y}⚠️  No SESSION_ID found. QR code will be displayed.${C.r}`);
    return false;
  }
  
  try {
    await fs.ensureDir('./session');
    const data = Buffer.from(config.SESSION_ID, 'base64').toString('utf8');
    
    // Validate JSON
    JSON.parse(data);
    
    await fs.writeFile('./session/creds.json', data);
    console.log(`${C.g}✅ Session restored${C.r}`);
    return true;
  } catch (err) {
    console.log(`${C.y}⚠️  Invalid SESSION_ID: ${err.message}${C.r}`);
    await fs.remove('./session'); // Clean invalid session
    return false;
  }
}

let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

async function startBot() {
  console.log(logo);
  
  await db.initDB();

  const hasSession = await restoreSession();
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  console.log(`${C.d}📱 Baileys v${version.join('.')}${C.r}\n`);

  // Use macOS Chrome browser for better compatibility
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !hasSession,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: Browsers.macOS('Chrome'), // More stable than custom browser
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    defaultQueryTimeoutMs: 0,
    emitOwnEvents: true,
    fireInitQueries: true,
    shouldIgnoreJid: jid => jid === 'status@broadcast'
  });

  // Initialize handlers
  const mega = new MegaHandler(sock, null, config);
  const antiBug = new AntiBug(sock);
  const statusReactor = new StatusReactor(sock);
  const autoBlock = new AutoBlock(sock);
  const commandReactor = new CommandReactor(sock, config);

  // Connection handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !hasSession) {
      console.log(`${C.y}📲 Scan QR with WhatsApp${C.r}`);
      reconnectAttempts = 0;
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      console.log(`${C.g}✅ ${config.BOT_NAME} CONNECTED${C.r}`);
      console.log(`${C.c}👤 ${sock.user?.name || config.OWNER_NAME}${C.r}`);
      console.log(`${C.m}🛡️  AntiBug: ${config.ANTIBUG ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}⚡ StatusReacts: ${config.COMMAND_STATUS_REACT ? 'ON' : 'OFF'}${C.r}\n`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || '';
      
      console.log(`${C.y}⚠️  Disconnected: ${DisconnectReason[statusCode] || statusCode}${C.r}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`${C.r}❌ Logged out. Restart and scan QR again.${C.r}`);
        await fs.remove('./session');
        process.exit(1);
      }

      if (reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        const delay = Math.min(5000 * reconnectAttempts, 30000);
        console.log(`${C.y}🔄 Reconnecting in ${delay/1000}s... (${reconnectAttempts}/${MAX_RECONNECT})${C.r}`);
        setTimeout(startBot, delay);
      } else {
        console.log(`${C.r}❌ Max reconnections reached${C.r}`);
        process.exit(1);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Message handler (simplified)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const m of messages) {
      if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;
      
      // Handle commands here (your existing logic)
      // ...
    }
  });
}

startBot().catch(console.error);
