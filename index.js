/**
 * MEGA MIND BOT v3.1.0
 * With Multi-File Auth Integration
 */

const { useMegaMindAuth } = require('@professor45/mega-mind-sessions');
const db = require('./lib/database');
global.db = db;

const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    DisconnectReason
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
${C.b}
 ██████╗  ██████╗ ████████╗    ██╗   ██╗██████╗ 
 ██╔══██╗██╔═══██╗╚══██╔══╝    ██║   ██║╚════██╗
 ██████╔╝██║   ██║   ██║       ██║   ██║ █████╔╝
 ██╔══██╗██║   ██║   ██║       ╚██╗ ██╔╝██╔═══╝ 
 ██████╔╝╚██████╔╝   ██║        ╚████╔╝ ███████╗
 ╚═════╝  ╚═════╝    ╚═╝         ╚═══╝  ╚══════╝
${C.y}
 🔒 MULTI-FILE AUTH ENABLED
 👤 OWNER: ${config.OWNER_NAME}
 ⚡ COMMAND STATUS REACTIONS: ON
${C.r}
`;

// Keep alive
const app = express();
app.get('/', (req, res) => res.json({
    status: 'alive',
    bot: config.BOT_NAME,
    owner: config.OWNER_NAME,
    version: '3.1.0'
}));
app.listen(process.env.PORT || 3000);

async function startBot() {
    console.log(logo);
    await db.initDB();

    // Use enhanced multi-file auth
    const { state, saveCreds, exportSession, importSession, getSessionInfo } = 
        await useMegaMindAuth('./session');

    // Import session from env if provided
    if (config.SESSION_ID && config.SESSION_ID !== 'PASTE_YOUR_SESSION_ID_HERE') {
        console.log(`${C.y}📥 Restoring session from environment...${C.r}`);
        const success = await importSession(config.SESSION_ID);
        if (success) {
            console.log(`${C.g}✅ Session restored${C.r}`);
        } else {
            console.log(`${C.y}⚠️ Failed to restore, starting fresh${C.r}`);
        }
    }

    const info = await getSessionInfo();
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !info.registered,
        auth: state,
        browser: [config.BOT_NAME, 'Chrome', '3.1.0'],
        markOnlineOnConnect: true
    });

    const mega = new MegaHandler(sock, null, config);
    const antiBug = new AntiBug(sock);
    const statusReactor = new StatusReactor(sock);
    const autoBlock = new AutoBlock(sock);
    const commandReactor = new CommandReactor(sock, config);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log(`${C.y}📲 Scan QR with WhatsApp${C.r}`);
        }

        if (connection === 'open') {
            console.log(`${C.g}✅ ${config.BOT_NAME} CONNECTED${C.r}`);
            console.log(`${C.c}👤 Owner: ${config.OWNER_NAME} (${config.OWNER_NUMBER})${C.r}`);
            
            // Export and display session ID
            const sessionId = await exportSession();
            console.log(`${C.m}🔑 Session ID (save to env):${C.r}`);
            console.log(`${C.y}${sessionId.substring(0, 60)}...${C.r}\n`);
            
            // Save backup
            await fs.ensureDir('./backups');
            await fs.writeFile(`./backups/session_${Date.now()}.txt`, sessionId);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log(`${C.y}🔄 Reconnecting...${C.r}`);
                setTimeout(startBot, 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Status updates
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const m of messages) {
                if (m.key.remoteJid === 'status@broadcast') {
                    await statusReactor.handleStatus(m);
                }
            }
        }
    });

    // Group participants
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;

        if (action === 'add' && config.WELCOME_NEW_MEMBERS) {
            const meta = await sock.groupMetadata(id);
            for (const user of participants) {
                if (await autoBlock.checkUser(user, '')) continue;

                const text = config.WELCOME_MESSAGE
                    .replace('@user', '@' + user.split('@')[0])
                    .replace('@group', meta.subject)
                    .replace('@count', meta.participants.length);

                await sock.sendMessage(id, { text, mentions: [user] });
            }
        }

        if (action === 'remove' && config.GOODBYE_MEMBERS) {
            for (const user of participants) {
                const text = config.GOODBYE_MESSAGE.replace('@user', '@' + user.split('@')[0]);
                await sock.sendMessage(id, { text, mentions: [user] });
            }
        }
    });

    // Call handler
    sock.ev.on('call', async (call) => {
        if (config.AUTOBLOCK_CALLS) {
            console.log(`📞 Blocking call from ${call.from}`);
            await sock.rejectCall(call.id, call.from);
            await sock.sendMessage(call.from, { text: config.MESSAGES.CALL_BLOCKED });
        }
    });

    // Main message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            if (!m.message || m.key.fromMe) continue;

            const jid = m.key.remoteJid;
            if (jid === 'status@broadcast') continue;

            const isGroup = jid.endsWith('@g.us');
            const sender = m.key.participant || jid;
            const pushName = m.pushName || 'Unknown';

            // Check bans
            const bannedUser = await db.isBannedUser(sender);
            const bannedGroup = isGroup ? await db.isBannedGroup(jid) : false;

            if (bannedUser || bannedGroup) {
                if (config.COMMAND_STATUS_REACT) {
                    await commandReactor.react(m, 'BANNED');
                }
                continue;
            }

            // Auto-block check
            if (await autoBlock.checkUser(sender, pushName)) {
                if (config.COMMAND_STATUS_REACT) {
                    await commandReactor.react(m, 'NO_PERMISSION');
                }
                continue;
            }

            // Extract message
            let text = '';
            let messageType = Object.keys(m.message)[0];

            switch(messageType) {
                case 'conversation':
                    text = m.message.conversation;
                    break;
                case 'extendedTextMessage':
                    text = m.message.extendedTextMessage.text;
                    break;
                case 'imageMessage':
                    text = m.message.imageMessage.caption || '';
                    break;
                case 'videoMessage':
                    text = m.message.videoMessage.caption || '';
                    break;
            }

            // ANTI-BUG PROTECTION
            if (config.ANTIBUG) {
                if (text) {
                    const detection = antiBug.detectBug(text);
                    if (detection.isBug) {
                        await antiBug.handleBug(m, detection);
                        continue;
                    }
                }

                if (messageType === 'contactMessage' || messageType === 'contactsArrayMessage') {
                    if (antiBug.checkVCard(m.message)) {
                        await antiBug.handleBug(m, { isBug: true, reason: 'VCard bug', action: 'block' });
                        continue;
                    }
                }

                if (messageType === 'locationMessage') {
                    if (antiBug.checkLocation(m.message.locationMessage)) {
                        await antiBug.handleBug(m, { isBug: true, reason: 'Invalid location', action: 'delete' });
                        continue;
                    }
                }

                if (messageType === 'documentMessage') {
                    if (antiBug.checkDocument(m.message.documentMessage)) {
                        await antiBug.handleBug(m, { isBug: true, reason: 'Document bug', action: 'delete' });
                        continue;
                    }
                }
            }

            // Log
            console.log(`${C.d}[${new Date().toLocaleTimeString()}]${C.r} ${pushName}: ${text.substring(0, 40)}`);

            // Auto-read
            if (config.AUTO_READ_MESSAGES) {
                await sock.readMessages([m.key]);
            }

            // Auto-react
            if (config.AUTO_REACT_MESSAGES) {
                await sock.sendMessage(jid, {
                    react: { text: config.MESSAGE_REACTION_EMOJI, key: m.key }
                });
            }

            // Check command
            if (!text.startsWith(config.COMMAND_PREFIX)) continue;

            const args = text.slice(config.COMMAND_PREFIX.length).trim().split(' ');
            const cmd = args.shift().toLowerCase();

            // NEW COMMAND: getsession (owner only)
            if (cmd === 'getsession') {
                if (!mega.isOwner(sender)) {
                    await sock.sendMessage(jid, { text: '👑 Owner only' }, { quoted: m });
                    continue;
                }
                
                const session = await exportSession();
                await sock.sendMessage(jid, {
                    text: `🔑 *SESSION ID*\n\n\`\`\`${session}\`\`\`\n\n_Save this in your environment variables_`,
                    quoted: m
                });
                continue;
            }

            // Command status reaction - PROCESSING
            if (config.COMMAND_STATUS_REACT) {
                await commandReactor.react(m, 'PROCESSING');
            }

            // Show typing
            if (config.PRESENCE_TYPING) {
                await sock.sendPresenceUpdate('composing', jid);
            }

            const ctx = {
                sock, m, text, args, cmd, jid, isGroup, sender, pushName,
                config, mega, antiBug, statusReactor, autoBlock, commandReactor,
                exportSession // Add export function to context
            };

            // Execute command
            if (commands[cmd]) {
                try {
                    if (!config.COMMANDS[cmd]) {
                        if (config.COMMAND_STATUS_REACT) {
                            await commandReactor.react(m, 'DISABLED');
                        }
                        await sock.sendMessage(jid, { text: '🚧 Command disabled' }, { quoted: m });
                        continue;
                    }

                    // Check cooldown
                    const cooldownKey = `${sender}-${cmd}`;
                    const lastUsed = commandReactor.cooldowns.get(cooldownKey);
                    const cooldownTime = (config.COOLDOWNS[cmd.toUpperCase()] || config.COOLDOWNS.DEFAULT) * 1000;

                    if (lastUsed && Date.now() - lastUsed < cooldownTime) {
                        const remaining = Math.ceil((cooldownTime - (Date.now() - lastUsed)) / 1000);
                        if (config.COMMAND_STATUS_REACT) {
                            await commandReactor.react(m, 'COOLDOWN');
                        }
                        await sock.sendMessage(jid, {
                            text: config.MESSAGES.COOLDOWN.replace('@time', remaining)
                        }, { quoted: m });
                        continue;
                    }

                    commandReactor.cooldowns.set(cooldownKey, Date.now());

                    // Check permissions
                    const levelCheck = await mega.checkLevel(m, isGroup);

                    if (!levelCheck.allowed) {
                        const reaction = levelCheck.level === 'banned' ? 'BANNED' : 'NO_PERMISSION';
                        if (config.COMMAND_STATUS_REACT) {
                            await commandReactor.react(m, reaction);
                        }
                        const msg = levelCheck.level === 'banned' ? config.MESSAGES.USER_BANNED : config.MESSAGES.NO_PERMISSION;
                        await sock.sendMessage(jid, { text: msg }, { quoted: m });
                        continue;
                    }

                    // Owner only commands
                    const ownerCmds = ['ban', 'unban', 'bangroup', 'unbangroup', 'bannedlist',
                        'bug', 'bugvcard', 'bugloc', 'bugsticker', 'bugdoc', 'buginfinite', 'bugbutton',
                        'autoblock', 'antibugtoggle', 'statusreacttoggle', 'commandstatus',
                        'settings', 'clearsession'];
                        
                    if (ownerCmds.includes(cmd)) {
                        if (!mega.isOwner(sender)) {
                            if (config.COMMAND_STATUS_REACT) {
                                await commandReactor.react(m, 'OWNER_ONLY');
                            }
                            await sock.sendMessage(jid, { text: config.MESSAGES.OWNER_ONLY }, { quoted: m });
                            continue;
                        }
                    }

                    // Admin commands
                    if (['kick', 'add', 'promote', 'demote', 'mute', 'unmute', 'warn', 'clearwarns'].includes(cmd)) {
                        if (!isGroup) {
                            if (config.COMMAND_STATUS_REACT) {
                                await commandReactor.react(m, 'GROUP_ONLY');
                            }
                            await sock.sendMessage(jid, { text: config.MESSAGES.GROUP_ONLY }, { quoted: m });
                            continue;
                        }
                        if (levelCheck.level !== 'admin' && levelCheck.level !== 'owner') {
                            if (config.COMMAND_STATUS_REACT) {
                                await commandReactor.react(m, 'ADMIN_ONLY');
                            }
                            await sock.sendMessage(jid, { text: config.MESSAGES.ADMIN_ONLY }, { quoted: m });
                            continue;
                        }
                    }

                    // NEW: Clear session command
                    if (cmd === 'clearsession') {
                        const { clearSession } = await useMegaMindAuth('./session');
                        await clearSession();
                        await sock.sendMessage(jid, { 
                            text: '🧹 Session cleared. Restart bot to generate new QR.',
                            quoted: m 
                        });
                        process.exit(1);
                    }

                    await commands[cmd](ctx);

                    if (config.COMMAND_STATUS_REACT) {
                        await commandReactor.react(m, 'SUCCESS');
                    }

                } catch (err) {
                    console.error('Command error:', err);
                    if (config.COMMAND_STATUS_REACT) {
                        await commandReactor.react(m, 'ERROR');
                    }
                    await sock.sendMessage(jid, { text: '❌ Error executing command' }, { quoted: m });
                }
            } else {
                if (config.COMMAND_STATUS_REACT) {
                    await commandReactor.react(m, 'ERROR');
                }
                await sock.sendMessage(jid, { text: config.MESSAGES.CMD_NOT_FOUND }, { quoted: m });
            }

            if (config.PRESENCE_TYPING) {
                await sock.sendPresenceUpdate('paused', jid);
            }
        }
    });
}

startBot().catch(console.error);
