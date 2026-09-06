/**
 * Owner commands — bot-level ban/unban (the bot ignores banned users'
 * commands everywhere, distinct from WhatsApp-level blocking which stops
 * all contact). Also exposes a banlist viewer.
 */

const db = require('../lib/database');

module.exports = [
    {
        name: 'ban',
        category: 'owner',
        description: "Ban a user from using the bot (reply/mention/number)",
        ownerOnly: true,
        handler: async ({ mega, m, mentions, quoted, args }) => {
            const target = mentions?.[0] || quoted?.key?.participant ||
                (args[0] ? `${args[0].replace(/\D/g, '')}@s.whatsapp.net` : null);
            if (!target) {
                await mega.reply(m, 'Mention, reply to, or give the number of the person to ban.');
                return;
            }
            const reason = args.slice(1).join(' ') || 'No reason given';
            db.banUser(target, reason);
            await mega.reply(m, `🚫 Banned @${target.split('@')[0]} from using the bot.\nReason: ${reason}`);
        }
    },
    {
        name: 'unban',
        category: 'owner',
        description: 'Lift a bot-level ban (reply/mention/number)',
        ownerOnly: true,
        handler: async ({ mega, m, mentions, quoted, args }) => {
            const target = mentions?.[0] || quoted?.key?.participant ||
                (args[0] ? `${args[0].replace(/\D/g, '')}@s.whatsapp.net` : null);
            if (!target) {
                await mega.reply(m, 'Mention, reply to, or give the number of the person to unban.');
                return;
            }
            db.unbanUser(target);
            await mega.reply(m, `✅ Unbanned @${target.split('@')[0]}`);
        }
    },
    {
        name: 'banlist',
        category: 'owner',
        description: 'List bot-level banned users',
        ownerOnly: true,
        handler: async ({ mega, m }) => {
            const list = db.getBannedList();
            if (!list.length) {
                await mega.reply(m, 'No users are currently banned from the bot.');
                return;
            }
            const text = list
                .map((u) => `• ${u.id.split('@')[0]} — ${u.reason}`)
                .join('\n');
            await mega.reply(m, `🚫 *Banned users:*\n\n${text}`);
        }
    }
];
