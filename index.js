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

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 30000;

async function startBot() {
    console.log(logo);

    const hasSession = await sessionManager.resolve();
    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`${C.c}📦 Baileys v${version.join('.')} (latest: ${isLatest})${C.r}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // we handle QR display ourselves below
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

    // ---- Wire up modules ----
    const mega = new MegaHandler(sock, config);
    const antiBug = new AntiBug(sock);
    const statusReactor = new StatusReactor(sock);
    const autoBlock = new AutoBlock(sock);
    const commandReactor = new CommandReactor(sock);
    const commandHandler = new CommandHandler(sock, config, mega, commandReactor);
    const groupEvents = new GroupEvents(sock);
    const antiDelete = new AntiDelete(sock);

    // ---- Connection lifecycle ----
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !hasSession) {
            console.log(`${C.y}📲 Scan this QR code with WhatsApp (Linked Devices → Link a Device):${C.r}`);
            qrcode.generate(qr, { small: true });
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
            const loggedOut = code === DisconnectReason.loggedOut;

            console.log(`${C.y}❌ Connection closed (code: ${code})${C.r}`);

            if (loggedOut) {
                console.log(`${C.r}🔒 Logged out. Clearing local session — generate a new one to reconnect.${C.r}`);
                const fs = require('fs-extra');
                await fs.remove(config.SESSION_DIR).catch(() => {});
                return; // don't auto-restart on a real logout
            }

            reconnectAttempts++;
            const delay = Math.min(3000 * reconnectAttempts, MAX_RECONNECT_DELAY_MS);
            console.log(`${C.y}🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...${C.r}`);
            setTimeout(startBot, delay);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ---- Incoming messages ----
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const m of messages) {
            if (!m.message) continue;

            // Status updates go through a separate path.
            if (m.key.remoteJid === 'status@broadcast') {
                await statusReactor.handle(m);
                continue;
            }

            if (m.key.fromMe) continue; // don't process the bot's own messages as commands

            // A "delete for everyone" shows up here as a protocolMessage, not as
            // a normal text/media message — route it to AntiDelete and stop.
            if (isRevokeMessage(m)) {
                await antiDelete.handleRevoke(m);
                continue;
            }

            db.incrementMessage();

            // Defensive filtering happens before anything else touches the message.
            const wasFlagged = await antiBug.handle(m);
            if (wasFlagged) continue;

            // Private-mode auto-block (no-op unless MODE=private and AUTOBLOCK=true).
            if (!m.key.remoteJid.endsWith('@g.us')) {
                await autoBlock.checkUser(m.key.remoteJid);
            }

            const parsed = parseMessage(m, config.PREFIX);

            // AFK notice: clear AFK status as soon as the AFK user sends anything themselves.
            const afk = db.getAFK(parsed.sender);
            if (afk) {
                db.removeAFK(parsed.sender);
            }

            antiDelete.remember(parsed);

            const linkHandled = await groupEvents.checkAntiLink(parsed);
            if (linkHandled) continue;

            if (parsed.isCommand) {
                await commandHandler.dispatch(parsed);
            }
        }
    });

    // ---- Group membership events ----
    sock.ev.on('group-participants.update', async (update) => {
        await groupEvents.handleParticipantsUpdate(update);
    });
}

/**
 * Detect a "delete for everyone" protocol message. Baileys represents this
 * as message.protocolMessage.type === REVOKE. The numeric value (0) has
 * been stable across recent Baileys releases, but we prefer the named
 * constant from the library's proto export when it's present, so this
 * keeps working even if that changes.
 */
function isRevokeMessage(m) {
    const protocolMessage = m.message?.protocolMessage;
    if (!protocolMessage) return false;

    try {
        // eslint-disable-next-line global-require
        const { proto } = require('@whiskeysockets/baileys');
        const REVOKE = proto?.Message?.ProtocolMessage?.Type?.REVOKE;
        if (REVOKE !== undefined) return protocolMessage.type === REVOKE;
    } catch {
        // fall through to numeric fallback below
    }

    return protocolMessage.type === 0;
}

startBot().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
});
