/**
 * Utility commands — AFK status, owner-level user blocking, broadcast.
 */

const db = require('../lib/database');

module.exports = [
    {
        name: 'afk',
        category: 'utility',
        description: 'Mark yourself as AFK with an optional reason',
        handler: async ({ mega, m, sender, argsText }) => {
            db.setAFK(sender, argsText || 'No reason given');
            await mega.reply(m, `💤 You're now AFK: ${argsText || 'No reason given'}`);
        }
    },
    {
        name: 'block',
        category: 'utility',
        description: 'Block a user (reply/mention/number)',
        ownerOnly: true,
        handler: async ({ mega, m, sock, mentions, quoted, args }) => {
            const target = mentions?.[0] || quoted?.key?.participant ||
                (args[0] ? `${args[0].replace(/\D/g, '')}@s.whatsapp.net` : null);
            if (!target) {
                await mega.reply(m, 'Mention, reply to, or give the number of the person to block.');
                return;
            }
            await sock.updateBlockStatus(target, 'block');
            await mega.reply(m, `🚫 Blocked @${target.split('@')[0]}`);
        }
    },
    {
        name: 'unblock',
        category: 'utility',
        description: 'Unblock a user by number',
        ownerOnly: true,
        handler: async ({ mega, m, sock, args }) => {
            const numeric = (args[0] || '').replace(/\D/g, '');
            if (numeric.length < 8) {
                await mega.reply(m, 'Usage: .unblock <phone number>');
                return;
            }
            await sock.updateBlockStatus(`${numeric}@s.whatsapp.net`, 'unblock');
            await mega.reply(m, `✅ Unblocked ${numeric}`);
        }
    },
    {
        name: 'broadcast',
        aliases: ['bc'],
        category: 'utility',
        description: 'Send a message to every group the bot is in (owner only)',
        ownerOnly: true,
        cooldown: 30,
        handler: async ({ mega, m, sock, argsText }) => {
            if (!argsText) {
                await mega.reply(m, 'Usage: .broadcast <message>');
                return;
            }
            const groups = await sock.groupFetchAllParticipating();
            const ids = Object.keys(groups);
            let sent = 0;
            for (const id of ids) {
                try {
                    await sock.sendMessage(id, { text: `📢 *Broadcast*\n\n${argsText}` });
                    sent++;
                    await new Promise((r) => setTimeout(r, 1500)); // gentle pacing
                } catch {
                    // Skip groups that fail (e.g. bot no longer a member) and keep going.
                }
            }
            await mega.reply(m, `✅ Broadcast sent to ${sent}/${ids.length} groups.`);
        }
    }
];
