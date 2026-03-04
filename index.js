const {
 default: makeWASocket,
 useMultiFileAuthState,
 fetchLatestBaileysVersion,  // ADD THIS
 DisconnectReason,
 Browsers,  // ADD THIS
 makeCacheableSignalKeyStore  // ADD THIS
} = require('@whiskeysockets/baileys');

// Restore session - FIXED
async function restoreSession() {
 if (!config.SESSION_ID) return false;
 try {
 await fs.ensureDir('./session');
 
 // Parse session data from session generator
 const sessionData = JSON.parse(Buffer.from(config.SESSION_ID, 'base64').toString());
 
 // Write creds.json
 await fs.writeFile('./session/creds.json', JSON.stringify(sessionData.creds, null, 2));
 
 console.log(`${C.g}✅ Session restored from SESSION_ID${C.r}`);
 return true;
 } catch (err) {
 console.error('Session restore error:', err);
 return false;
 }
}

// Start bot - FIXED
async function startBot() {
 console.log(logo);

 await db.initDB();

 const hasSession = await restoreSession();
 const { state, saveCreds } = await useMultiFileAuthState('./session');
 
 // FETCH LATEST BAILEYS VERSION
 const { version, isLatest } = await fetchLatestBaileysVersion();
 console.log(`${C.c}📦 Baileys v${version.join('.')} (Latest: ${isLatest})${C.r}`);

 const sock = makeWASocket({
 version,  // Use latest version
 logger: pino({ level: 'silent' }),
 printQRInTerminal: !hasSession,
 auth: {
 creds: state.creds,
 keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
 },
 browser: Browsers.macOS('Chrome'),  // BETTER BROWSER FINGERPRINT
 markOnlineOnConnect: true,
 syncFullHistory: false,
 keepAliveIntervalMs: 30000,
 connectTimeoutMs: 60000,
 defaultQueryTimeoutMs: 60000,
 mobile: false,  // IMPORTANT: Disable mobile for QR compatibility
 generateHighQualityLinkPreview: true
 });

 // Initialize systems
 const mega = new MegaHandler(sock, null, config);
 const antiBug = new AntiBug(sock);
 const statusReactor = new StatusReactor(sock);
 const autoBlock = new AutoBlock(sock);
 const commandReactor = new CommandReactor(sock, config);

 // Connection handler - FIXED
 sock.ev.on('connection.update', async (update) => {
 const { connection, lastDisconnect, qr } = update;

 if (qr) {
 console.log(`${C.y}📲 QR Code generated! Scan with WhatsApp${C.r}`);
 console.log(`${C.y}   Settings → Linked Devices → Link a Device${C.r}`);
 }

 if (connection === 'open') {
 console.log(`${C.g}✅ ${config.BOT_NAME} CONNECTED${C.r}`);
 console.log(`${C.c}👤 User: ${sock.user.name} (${sock.user.id})${C.r}`);
 console.log(`${C.m}🛡️ AntiBug: ${config.ANTIBUG ? 'ON' : 'OFF'}${C.r}`);
 console.log(`${C.m}🔒 AutoBlock: ${config.AUTOBLOCK ? 'ON' : 'OFF'}${C.r}`);
 console.log(`${C.m}💯 StatusReact: ${config.STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
 console.log(`${C.m}⚡ CommandStatus: ${config.COMMAND_STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
 console.log(`${C.m}🔧 Prefix: ${config.COMMAND_PREFIX}${C.r}\n`);
 }

 if (connection === 'close') {
 const code = lastDisconnect?.error?.output?.statusCode;
 const shouldReconnect = code !== DisconnectReason.loggedOut;
 
 console.log(`${C.y}❌ Connection closed. Code: ${code}${C.r}`);

 if (code === DisconnectReason.restartRequired) {
 console.log(`${C.y}🔄 Restart required, reconnecting...${C.r}`);
 setTimeout(startBot, 3000);
 } else if (shouldReconnect) {
 console.log(`${C.y}🔄 Reconnecting in 5s...${C.r}`);
 setTimeout(startBot, 5000);
 } else {
 console.log(`${C.r}🔒 Logged out. Please generate new session.${C.r}`);
 // Clean up session
 await fs.remove('./session');
 }
 }
 });

 sock.ev.on('creds.update', saveCreds);
 
 // ... rest of your code ...
}
