/**
 * General commands — menu, ping, bot info, etc.
 */

module.exports = [
    {
        name: 'menu',
        aliases: ['help', 'commands'],
        category: 'general',
        description: 'Show the full command list',
        cooldown: 5,
        handler: async ({ mega, m, config, commandHandlerRef }) => {
            // commandHandlerRef is injected by index.js after construction
            const handler = commandHandlerRef;
            const categories = handler.getCategories();

            let text = `╭───「 *${config.BOT_NAME}* 」\n`;
            text += `│ Prefix: *${config.PREFIX}*\n`;
            text += `│ Mode: *${config.MODE}*\n`;
            text += `╰───────────────\n\n`;

            for (const [category, defs] of categories) {
                const unique = [...new Set(defs)];
                text += `*▸ ${category.toUpperCase()}*\n`;
                for (const def of unique) {
                    text += `  ${config.PREFIX}${def.name} — ${def.description || ''}\n`;
                }
                text += '\n';
            }

            text += `_Send ${config.PREFIX}ping to check if I'm online._`;

            await mega.reply(m, text.trim());
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
            const text =
                `🤖 *${config.BOT_NAME}* v${config.VERSION}\n\n` +
                `👑 Owner: ${config.OWNER_NAME}\n` +
                `⚙️ Mode: ${config.MODE}\n` +
                `🔧 Prefix: ${config.PREFIX}\n` +
                `⏱️ Uptime: ${mega.getUptime()}\n` +
                `💾 Memory: ${mega.formatBytes(process.memoryUsage().heapUsed)}`;
            await mega.reply(m, text);
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
