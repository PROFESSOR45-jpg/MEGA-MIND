/**
 * General commands — menu, ping, bot info, etc.
 */

const { header, footer, row } = require('../lib/style');
const menuState = require('../lib/menuState');
const { renderMainMenu, renderCategory, CATEGORIES } = require('../lib/menuRender');
const db = require('../lib/database');

module.exports = [
    {
        name: 'menu',
        aliases: ['help', 'commands'],
        category: 'general',
        description: 'Show the full command list',
        cooldown: 5,
        handler: async ({ mega, m, config, args, commandHandlerRef }) => {
            const jid = m.key.remoteJid;

            // .menu <category> jumps straight to a section by name/alias
            if (args[0]) {
                const query = args[0].toLowerCase();
                const match = CATEGORIES.find(
                    (c) => c.key === query || c.label.toLowerCase().startsWith(query)
                );
                if (match) {
                    const text = renderCategory(match, config, commandHandlerRef);
                    await mega.sendBranded(jid, text, m);
                    return;
                }
            }

            menuState.set(jid, CATEGORIES);
            const text = renderMainMenu(config, m.pushName);
            await mega.sendBranded(jid, text, m);
        }
    },
    {
        name: 'repo',
        aliases: ['source', 'github', 'sc'],
        category: 'general',
        description: "Get the bot's source code repository",
        handler: async ({ mega, m, config }) => {
            let text = `${header(config, 'Source Code')}\n\n`;
            text += row('📦', 'Repo', config.REPO_URL) + '\n';
            text += row('🏷️', 'Version', config.VERSION) + '\n\n';
            text += `_Star the repo if you find ${config.BOT_NAME} useful! ⭐_\n\n`;
            text += footer(config);

            await mega.sendBranded(m.key.remoteJid, text.trim(), m);
        }
    },
    {
        name: 'ping',
        category: 'general',
        description: 'Check response time',
        cooldown: 2,
        handler: async ({ mega, m }) => {
            const start = Date.now();
            await mega.reply(m, '🏓 Pong!').then(async () => {
                const latency = Date.now() - start;
                await mega.reply(m, `📶 Speed: ${latency}ms`);
            });
        }
    },
    {
        name: 'info',
        aliases: ['botinfo', 'about'],
        category: 'general',
        description: 'Show bot information',
        handler: async ({ mega, m, config }) => {
            let text = `${header(config, 'Bot Information')}\n\n`;
            text += row('👑', 'Owner', config.OWNER_NAME) + '\n';
            text += row('⚙️', 'Mode', config.MODE) + '\n';
            text += row('🔧', 'Prefix', config.PREFIX) + '\n';
            text += row('⏱️', 'Uptime', mega.getUptime()) + '\n';
            text += row('💾', 'Memory', mega.formatBytes(process.memoryUsage().heapUsed)) + '\n\n';
            text += footer(config);

            await mega.sendBranded(m.key.remoteJid, text.trim(), m);
        }
    },
    {
        name: 'alive',
        category: 'general',
        description: 'Confirm the bot is running',
        handler: async ({ mega, m, config }) => {
            await mega.reply(m, `✅ ${config.BOT_NAME} is alive and running.\nUptime: ${mega.getUptime()}`);
        }
    },
    {
        name: 'top',
        aliases: ['leaderboard', 'topusers'],
        category: 'general',
        description: 'Show the most active users',
        handler: async ({ mega, m, config }) => {
            const users = db.getTopUsers(10);
            let text = `${header(config, 'Top Users')}\n\n`;
            if (!users.length) {
                text += 'No message activity recorded yet.\n\n';
            } else {
                const lines = users.map((u, i) => {
                    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
                    return `${medal} ${u.name || `@${u.id.split('@')[0]}`} — ${u.messages} msgs`;
                });
                text += lines.join('\n') + '\n\n';
            }
            text += footer(config);
            await mega.reply(m, text.trim());
        }
    },
    {
        name: 'stats',
        aliases: ['botstats'],
        category: 'general',
        description: "Show the bot's usage statistics",
        handler: async ({ mega, m, config }) => {
            const s = db.data.stats;
            const userCount = Object.keys(db.data.users).length;
            const groupCount = Object.keys(db.data.groups).length;

            let text = `${header(config, 'Bot Statistics')}\n\n`;
            text += row('💬', 'Messages seen', String(s.messages)) + '\n';
            text += row('⚡', 'Commands run', String(s.commands)) + '\n';
            text += row('👤', 'Known users', String(userCount)) + '\n';
            text += row('👥', 'Known groups', String(groupCount)) + '\n';
            text += row('⏱️', 'Uptime', mega.getUptime()) + '\n';
            text += row('💾', 'Memory', mega.formatBytes(process.memoryUsage().heapUsed)) + '\n\n';
            text += footer(config);

            await mega.sendBranded(m.key.remoteJid, text.trim(), m);
        }
    },
    {
        name: 'owner',
        category: 'general',
        description: "Get the bot owner's contact",
        handler: async ({ mega, m, config }) => {
            if (!config.OWNER_NUMBER) {
                await mega.reply(m, 'Owner number is not configured.');
                return;
            }
            await mega.sock.sendMessage(m.key.remoteJid, {
                contacts: {
                    displayName: config.OWNER_NAME,
                    contacts: [{
                        vcard:
                            `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\n` +
                            `TEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\nEND:VCARD`
                    }]
                }
            }, { quoted: m });
        }
    }
];
