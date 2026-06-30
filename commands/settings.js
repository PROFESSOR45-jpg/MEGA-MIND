/**
 * Settings / protection toggles — owner-only switches for the bot's
 * automatic behaviors. Group-scoped toggles (antilink, antidelete, welcome,
 * goodbye) are stored per-group in the database; global toggles (mode,
 * antibug, autoblock, status react) live in the in-memory config for the
 * current process (restarting the bot resets them to .env defaults).
 */

const db = require('../lib/database');

function toggleHandler(label, groupKey) {
    return async ({ mega, m, jid }) => {
        const group = db.getGroup(jid);
        const next = !group[groupKey];
        db.updateGroup(jid, { [groupKey]: next });
        await mega.reply(m, `${label}: ${next ? '✅ ON' : '❌ OFF'}`);
    };
}

module.exports = [
    {
        name: 'antilink',
        category: 'protection',
        description: 'Toggle auto-delete of links in this group',
        groupOnly: true,
        adminOnly: true,
        handler: toggleHandler('🔗 AntiLink', 'antilink')
    },
    {
        name: 'antidelete',
        category: 'protection',
        description: 'Toggle resending deleted messages in this group',
        groupOnly: true,
        adminOnly: true,
        handler: toggleHandler('🗑️ AntiDelete', 'antidelete')
    },
    {
        name: 'welcome',
        category: 'protection',
        description: 'Toggle welcome messages for new members',
        groupOnly: true,
        adminOnly: true,
        handler: toggleHandler('👋 Welcome messages', 'welcome')
    },
    {
        name: 'goodbye',
        category: 'protection',
        description: 'Toggle goodbye messages for leaving members',
        groupOnly: true,
        adminOnly: true,
        handler: toggleHandler('👋 Goodbye messages', 'goodbye')
    },
    {
        name: 'mode',
        category: 'protection',
        description: 'Set bot mode: public / private / self',
        ownerOnly: true,
        handler: async ({ mega, m, config, args }) => {
            const choice = (args[0] || '').toLowerCase();
            if (!['public', 'private', 'self'].includes(choice)) {
                await mega.reply(m, `Current mode: *${config.MODE}*\nUsage: .mode <public|private|self>`);
                return;
            }
            config.MODE = choice;
            db.setRuntimeSetting('mode', choice);
            await mega.reply(m, `✅ Mode set to *${choice}*.`);
        }
    },
    {
        name: 'setprefix',
        category: 'protection',
        description: "Change the bot's command prefix",
        ownerOnly: true,
        handler: async ({ mega, m, config, args }) => {
            const newPrefix = args[0];
            if (!newPrefix || newPrefix.length > 3) {
                await mega.reply(m, `Current prefix: *${config.PREFIX}*\nUsage: .setprefix <symbol>`);
                return;
            }
            config.PREFIX = newPrefix;
            db.setRuntimeSetting('prefix', newPrefix);
            await mega.reply(m, `✅ Prefix changed to: ${newPrefix}`);
        }
    },
    {
        name: 'statusreact',
        category: 'protection',
        description: 'Toggle auto-reacting to contact statuses',
        ownerOnly: true,
        handler: async ({ mega, m, config }) => {
            config.STATUS_REACT = !config.STATUS_REACT;
            db.setRuntimeSetting('statusReact', config.STATUS_REACT);
            await mega.reply(m, `💯 Status auto-react: ${config.STATUS_REACT ? '✅ ON' : '❌ OFF'}`);
        }
    },
    {
        name: 'statusemojis',
        aliases: ['setstatusemojis'],
        category: 'protection',
        description: 'Set the emoji pool used for status auto-react',
        ownerOnly: true,
        handler: async ({ mega, m, config, args }) => {
            if (!args.length) {
                await mega.reply(
                    m,
                    `Current pool: ${config.STATUS_REACTION_EMOJIS.join(' ')}\n` +
                    `Usage: .statusemojis 🔥 ❤️ 😍 👍 💯`
                );
                return;
            }
            config.STATUS_REACTION_EMOJIS = args;
            db.setRuntimeSetting('statusReactionEmojis', args);
            await mega.reply(m, `✅ Status react emoji pool updated:\n${args.join(' ')}`);
        }
    },
    {
        name: 'presence',
        aliases: ['setpresence'],
        category: 'protection',
        description: 'Set bot presence: typing / recording / both / online / offline / off',
        ownerOnly: true,
        handler: async ({ mega, m, config, args }) => {
            const PresenceManager = require('../lib/presence');
            const choice = (args[0] || '').toLowerCase();

            if (!PresenceManager.VALID_MODES.includes(choice)) {
                await mega.reply(
                    m,
                    `Current presence: *${config.PRESENCE_MODE}*\n` +
                    `Usage: .presence <${PresenceManager.VALID_MODES.join('|')}>`
                );
                return;
            }

            config.PRESENCE_MODE = choice;
            db.setRuntimeSetting('presenceMode', choice);
            await mega.presence.applyGlobalPresence();
            await mega.reply(m, `📡 Presence set to *${choice}*.`);
        }
    },
    {
        name: 'antibug',
        category: 'protection',
        description: 'Toggle filtering of malformed/abusive incoming messages',
        ownerOnly: true,
        handler: async ({ mega, m, config }) => {
            config.ANTIBUG = !config.ANTIBUG;
            await mega.reply(m, `🛡️ AntiBug: ${config.ANTIBUG ? '✅ ON' : '❌ OFF'}`);
        }
    }
];
