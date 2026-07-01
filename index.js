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
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');

const config = require('./config');
const sessionManager = require('./lib/sessionManager');
const db = require('./lib/database');
const MegaHandler = require('./lib/megaHandler');
const PresenceManager = require('./lib/presence');
const AntiBug = require('./lib/antibug');
const AutoBlock = require('./lib/autoBlock');
const StatusReactor = require('./lib/statusReact');
const CommandReactor = require('./lib/commandReactor');
const CommandHandler = require('./lib/commandHandler');
const GroupEvents = require('./lib/groupEvents');
const AntiDelete = require('./lib/antiDelete');
const { parseMessage } = require('./lib/messageParser');
const menuState = require('./lib/menuState');
const { renderCategory } = require('./lib/menuRender');

const C = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[0m', c: '\x1b[36m', m: '\x1b[35m' };

const logo = `
${C.c}╔═══════════════════════════════════════╗
║         ${C.g}M E G A   M I N D${C.c}              ║
║      WhatsApp Bot — v${config.VERSION}            ║
╚═══════════════════════════════════════╝${C.r}
`;

// Codes that mean the session is dead and cannot be reused.
// IMPORTANT: 428 (connectionClosed) is NOT included here — it's an ordinary,
// often transient disconnect (network blip, WA server restart, host idling)
// and does NOT mean the session is invalid. Wiping the session on every 428
// was the cause of repeated logout loops: it forced the bot to fall back to
// re-decoding the original static SESSION_ID on every restart, which had
// already drifted out of sync with WhatsApp's side after the first real
// connection — causing another disconnect, another wipe, forever.
const DEAD_SESSION_CODES = [
    440,  // connectionReplaced — another device/session took over
    401,  // loggedOut — session explicitly revoked by WhatsApp
    403,  // forbidden — account/session banned
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
        // Must match the browser fingerprint used by the session generator
        // (mega-mind-sessions/server.js) exactly. If the device fingerprint
        // used to link the session differs from the one used to reconnect,
        // WhatsApp treats it as a different/suspicious device and revokes
        // the session — this was the cause of repeated logouts.
        browser: ['MEGA MIND', 'Chrome', '120.0.0'],
        markOnlineOnConnect: true,
        syncFullHistory: false,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true
    });

    const mega = new MegaHandler(sock, config);
    const presence = new PresenceManager(sock, config);
    mega.presence = presence; // accessible from command handlers as mega.presence
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
            console.log(`${C.m}🛡️  AntiBug: ${config.ANTIBUG ? 'ON' : 'OFF'}  |  🔒 AutoBlock: ${config.AUTOBLOCK ? 'ON' : 'OFF'}  |  👁️ StatusView: ${config.STATUS_VIEW ? 'ON' : 'OFF'}  |  💯 StatusReact: ${config.STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
            console.log(`${C.m}🔧 Prefix: ${config.PREFIX}  |  ⚙️  Mode: ${config.MODE}${C.r}\n`);

            // Set the bot's WhatsApp profile picture from assets/profile.png
            // (or BOT_IMAGE_URL) — only needs to succeed once; harmless if
            // it fails (e.g. rate-limited), so we never block startup on it.
            const image = mega.getBotImage();
            if (image) {
                try {
                    await sock.updateProfilePicture(sock.user.id, Buffer.isBuffer(image) ? image : { url: image });
                    console.log(`${C.g}🖼️  Profile picture updated${C.r}`);
                } catch (err) {
                    console.log(`${C.y}⚠️  Could not update profile picture: ${err.message}${C.r}`);
                }
            }

            await presence.applyGlobalPresence();
            console.log(`${C.m}📡 Presence mode: ${config.PRESENCE_MODE}${C.r}`);

            if (config.OWNER_NUMBER) {
                const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                const { header, footer, row } = require('./lib/style');
                let text = `${header(config, 'Online & Ready')}\n\n`;
                text += row('🔧', 'Prefix', config.PREFIX) + '\n';
                text += row('⚙️', 'Mode', config.MODE) + '\n';
                text += row('👤', 'Owner', config.OWNER_NAME) + '\n\n';
                text += `_Connected at ${new Date().toLocaleString()}_\n\n`;
                text += footer(config);

                mega.sendBranded(ownerJid, text.trim())
                    .catch((err) => console.log(`${C.y}⚠️  Could not send startup message: ${err.message}${C.r}`));
            }
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
        if (config.DEBUG) console.log(`${C.c}🐛 messages.upsert fired — type: ${type}, count: ${messages.length}${C.r}`);
        if (type !== 'notify') {
            if (config.DEBUG) console.log(`${C.y}🐛 Ignored — type "${type}" is not "notify"${C.r}`);
            return;
        }

        for (const m of messages) {
            if (!m.message) {
                if (config.DEBUG) console.log(`${C.y}🐛 Skipped — message has no .message payload (key: ${JSON.stringify(m.key)})${C.r}`);
                continue;
            }

            if (m.key.remoteJid === 'status@broadcast') {
                // Fire-and-forget: viewing/reacting to a status is a network
                // round-trip that shouldn't block the rest of this batch
                // (real chat messages arriving alongside a burst of status
                // updates would otherwise queue up behind it). The dedupe
                // check inside handle() runs synchronously before any
                // await, so this stays race-safe even unawaited.
                statusReactor.handle(m).catch((err) => {
                    console.error('Status handler error:', err.message);
                });
                continue;
            }

            // Note: we do NOT skip fromMe messages here. The bot is linked
            // to the owner's own number, so commands sent from that same
            // number (the normal way to control a self-hosted bot) arrive
            // as fromMe: true. Permission checks in megaHandler.checkAccess
            // already correctly identify the owner by phone number.

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
            if (config.DEBUG) {
                console.log(`${C.c}🐛 From: ${parsed.sender} | jid: ${parsed.jid} | fromMe: ${m.key.fromMe} | text: "${parsed.text}" | isCommand: ${parsed.isCommand} | command: ${parsed.command}${C.r}`);
            }

            const afk = db.getAFK(parsed.sender);
            if (afk) db.removeAFK(parsed.sender);

            antiDelete.remember(parsed);

            const linkHandled = await groupEvents.checkAntiLink(parsed);
            if (linkHandled) continue;

            // "Reply with a number" menu navigation — only applies when the
            // chat has a pending menu (sent by .menu) and the message isn't
            // itself a command.
            if (!parsed.isCommand) {
                const selection = menuState.resolve(parsed.jid, parsed.text);
                if (selection) {
                    const text = renderCategory(selection, config, commandHandler);
                    await mega.sendBranded(parsed.jid, text, m);
                    continue;
                }
            }

            if (parsed.isCommand) {
                if (config.DEBUG) {
                    const found = commandHandler.getCommand(parsed.command);
                    console.log(`${C.c}🐛 Dispatching "${parsed.command}" — registered: ${Boolean(found)}${C.r}`);
                }
                presence.simulate(parsed.jid); // fire-and-forget, never blocks the reply
                try {
                    await commandHandler.dispatch(parsed);
                } catch (err) {
                    // commandHandler.dispatch already has its own try/catch around
                    // individual handlers, but this is a last-resort net so a bug
                    // anywhere in the dispatch path logs loudly instead of just
                    // going silent.
                    console.error(`${C.r}❌ Dispatch error for "${parsed.command}":${C.r}`, err);
                }
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
