/**
 * MEGA MIND — WhatsApp Bot
 * Entrypoint: connects to WhatsApp via Baileys, resolves a session (local,
 * pasted, or fetched from the separate session server), and wires up all
 * commands and automatic features.
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');

const config = require('./config');
const sessionManager = require('./lib/sessionManager');
const db = require('./lib/database');
const MegaHandler = require('./lib/megaHandler');
const AntiBug = require('./lib/antibug');
const AutoBlock = require('./lib/autoBlock');
const StatusReactor = require('./lib/statusReact');
const CommandReactor = require('./lib/commandReactor');
const CommandHandler = require('./lib/commandHandler');
const GroupEvents = require('./lib/groupEvents');
const AntiDelete = require('./lib/antiDelete');
const { parseMessage } = require('./lib/messageParser');

const C = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[0m', c: '\x1b[36m', m: '\x1b[35m' };

const logo = `
${C.c}╔═══════════════════════════════════════╗
║         ${C.g}M E G A   M I N D${C.c}              ║
║      WhatsApp Bot — v${config.VERSION}            ║
╚═══════════════════════════════════════╝${C.r}
`;

// Codes that mean the session is dead and cannot be reused
const DEAD_SESSION_CODES = [
    428,  // Precondition Required — session rejected by WA
    440,  // Logged in elsewhere — another device took over
    401,  // Unauthorized — session revoked
    403,  // Forbidden — session banned
    DisconnectReason.loggedOut
];

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_RECONNECT_DELAY_MS = 30000;

async function clearSession() {
    await fs.remove(config.SESSION_DIR).catch(() => {});
    console.log(`${C.y}🗑️  Local session cleared.${C.r}`);
}

async function startBot() {
    console.log(logo);

    let hasSession;
    try {
        hasSession = await sessionManager.resolve();
    } catch (err) {
        console.log(`${C.r}❌ Session error: ${err.message}${C.r}`);
        console.log(`${C.y}⛔ Stopping — not generating a QR code.${C.r}`);
        process.exit(1);
    }
    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`${C.c}📦 Baileys v${version.join('.')} (latest: ${isLatest})${C.r}`);
    console.log(`${C.c}📦 Loaded ${require('./lib/commandHandler').commandCount || 33} commands across 6 categories${C.r}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: Browsers.macOS('Chrome'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true
    });

    const mega = new MegaHandler(sock, config);
    const antiBug = new AntiBug(sock);
    const statusReactor = new StatusReactor(sock);
    const autoBlock = new AutoBlock(sock);
    const commandReactor = new CommandReactor(sock);
    const commandHandler = new CommandHandler(sock, config, mega, commandReactor);
    const groupEvents = new GroupEvents(sock);
    const antiDelete = new AntiDelete(sock);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !hasSession) {
            console.log(`${C.r}❌ No valid session — refusing to show QR code. Fix SESSION_ID in set.js and restart.${C.r}`);
        }

        if (connection === 'open') {
            reconnectAttempts = 0;
            console.log(`${C.g}✅ ${config.BOT_NAME} connected${C.r}`);
            console.log(`${C.c}👤 ${sock.user?.name || 'Unknown'} (${sock.user?.id})${C.r}`);
            console.log(`${C.m}🛡️  AntiBug: ${config.ANTIBUG ? 'ON' : 'OFF'}  |  🔒 AutoBlock: ${config.AUTOBLOCK ? 'ON' : 'OFF'}  |  💯 StatusReact: ${config.STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
            console.log(`${C.m}🔧 Prefix: ${config.PREFIX}  |  ⚙️  Mode: ${config.MODE}${C.r}\n`);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`${C.y}❌ Connection closed (code: ${code})${C.r}`);

            // Dead session — clear it and stop retrying
            if (DEAD_SESSION_CODES.includes(code)) {
                await clearSession();
                console.log(`${C.r}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.r}`);
                console.log(`${C.y}⚠️  Session is dead (code: ${code}).${C.r}`);
                console.log(`${C.g}👉 Get a new session from:${C.r}`);
                console.log(`${C.c}   https://mega-mind-sessions.onrender.com${C.r}`);
                console.log(`${C.g}👉 Paste it in .env as SESSION_ID=MEGA~...${C.r}`);
                console.log(`${C.g}👉 Then run: npm start${C.r}`);
                console.log(`${C.r}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.r}`);
                process.exit(0); // clean exit — no infinite loop
            }

            // Too many retries
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                await clearSession();
                console.log(`${C.r}⛔ Too many reconnect attempts. Session cleared.${C.r}`);
                console.log(`${C.g}👉 Get a new session: https://mega-mind-sessions.onrender.com${C.r}`);
                process.exit(0);
            }

            reconnectAttempts++;
            const delay = Math.min(3000 * reconnectAttempts, MAX_RECONNECT_DELAY_MS);
            console.log(`${C.y}🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...${C.r}`);
            setTimeout(startBot, delay);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const m of messages) {
            if (!m.message) continue;

            if (m.key.remoteJid === 'status@broadcast') {
                await statusReactor.handle(m);
                continue;
            }

            if (m.key.fromMe) continue;

            if (isRevokeMessage(m)) {
                await antiDelete.handleRevoke(m);
                continue;
            }

            db.incrementMessage();

            const wasFlagged = await antiBug.handle(m);
            if (wasFlagged) continue;

            if (!m.key.remoteJid.endsWith('@g.us')) {
                await autoBlock.checkUser(m.key.remoteJid);
            }

            const parsed = parseMessage(m, config.PREFIX);

            const afk = db.getAFK(parsed.sender);
            if (afk) db.removeAFK(parsed.sender);

            antiDelete.remember(parsed);

            const linkHandled = await groupEvents.checkAntiLink(parsed);
            if (linkHandled) continue;

            if (parsed.isCommand) {
                await commandHandler.dispatch(parsed);
            }
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        await groupEvents.handleParticipantsUpdate(update);
    });
}

function isRevokeMessage(m) {
    const protocolMessage = m.message?.protocolMessage;
    if (!protocolMessage) return false;
    try {
        const { proto } = require('@whiskeysockets/baileys');
        const REVOKE = proto?.Message?.ProtocolMessage?.Type?.REVOKE;
        if (REVOKE !== undefined) return protocolMessage.type === REVOKE;
    } catch {}
    return protocolMessage.type === 0;
}

startBot().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
});
