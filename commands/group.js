/**
 * Group admin commands — moderation tools for group chats.
 * All require the command sender to be a group admin or the bot owner,
 * and (where they change group state) require the bot itself to be admin.
 */

function targetFromArgsOrQuoted({ mentions, quoted, args }) {
    if (mentions?.length) return mentions[0];
    if (quoted?.key?.participant) return quoted.key.participant;
    const numeric = (args[0] || '').replace(/\D/g, '');
    if (numeric.length >= 8) return `${numeric}@s.whatsapp.net`;
    return null;
}

module.exports = [
    {
        name: 'kick',
        aliases: ['remove'],
        category: 'group',
        description: 'Remove a member (reply/mention/number)',
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid, mentions, quoted, args }) => {
            const target = targetFromArgsOrQuoted({ mentions, quoted, args });
            if (!target) {
                await mega.reply(m, 'Mention, reply to, or give the number of the person to kick.');
                return;
            }
            const ok = await mega.kick(jid, target);
            await mega.reply(m, ok ? `✅ Removed @${target.split('@')[0]}` : '❌ Could not remove that user.');
        }
    },
    {
        name: 'add',
        category: 'group',
        description: 'Add a member by number',
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid, args }) => {
            const numeric = (args[0] || '').replace(/\D/g, '');
            if (numeric.length < 8) {
                await mega.reply(m, 'Usage: .add <phone number with country code>');
                return;
            }
            const ok = await mega.add(jid, `${numeric}@s.whatsapp.net`);
            await mega.reply(m, ok ? `✅ Added ${numeric}` : '❌ Could not add that number (it may have privacy settings preventing direct adds).');
        }
    },
    {
        name: 'promote',
        category: 'group',
        description: 'Make a member an admin (reply/mention/number)',
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid, mentions, quoted, args }) => {
            const target = targetFromArgsOrQuoted({ mentions, quoted, args });
            if (!target) {
                await mega.reply(m, 'Mention, reply to, or give the number of the person to promote.');
                return;
            }
            const ok = await mega.promote(jid, target);
            await mega.reply(m, ok ? `✅ Promoted @${target.split('@')[0]}` : '❌ Could not promote that user.');
        }
    },
    {
        name: 'demote',
        category: 'group',
        description: 'Remove admin from a member (reply/mention/number)',
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid, mentions, quoted, args }) => {
            const target = targetFromArgsOrQuoted({ mentions, quoted, args });
            if (!target) {
                await mega.reply(m, 'Mention, reply to, or give the number of the person to demote.');
                return;
            }
            const ok = await mega.demote(jid, target);
            await mega.reply(m, ok ? `✅ Demoted @${target.split('@')[0]}` : '❌ Could not demote that user.');
        }
    },
    {
        name: 'mute',
        aliases: ['close'],
        category: 'group',
        description: 'Only admins can send messages',
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid }) => {
            const ok = await mega.muteGroup(jid);
            await mega.reply(m, ok ? '🔇 Group muted — only admins can send messages.' : '❌ Failed to mute group.');
        }
    },
    {
        name: 'unmute',
        aliases: ['open'],
        category: 'group',
        description: 'Allow everyone to send messages again',
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid }) => {
            const ok = await mega.unmuteGroup(jid);
            await mega.reply(m, ok ? '🔊 Group unmuted — everyone can send messages.' : '❌ Failed to unmute group.');
        }
    },
    {
        name: 'tagall',
        aliases: ['everyone'],
        category: 'group',
        description: 'Mention every member of the group',
        groupOnly: true,
        adminOnly: true,
        handler: async ({ mega, m, jid, argsText }) => {
            const meta = await mega.getGroupMetadata(jid);
            const mentions = meta.participants.map((p) => p.id);
            const lines = meta.participants.map((p) => `@${p.id.split('@')[0]}`);
            const header = argsText ? `📢 ${argsText}\n\n` : '📢 *Attention everyone:*\n\n';
            await mega.sock.sendMessage(jid, { text: header + lines.join('\n'), mentions }, { quoted: m });
        }
    },
    {
        name: 'groupinfo',
        aliases: ['ginfo'],
        category: 'group',
        description: 'Show group details',
        groupOnly: true,
        handler: async ({ mega, m, jid }) => {
            const meta = await mega.getGroupMetadata(jid);
            const admins = meta.participants.filter((p) => p.admin).length;
            const text =
                `📋 *${meta.subject}*\n\n` +
                `👥 Members: ${meta.participants.length}\n` +
                `👮 Admins: ${admins}\n` +
                `🆔 ID: ${meta.id}\n` +
                (meta.desc ? `\n📝 ${meta.desc}` : '');
            await mega.reply(m, text);
        }
    },
    {
        name: 'setname',
        category: 'group',
        description: "Change the group's name",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid, argsText, sock }) => {
            if (!argsText) {
                await mega.reply(m, 'Usage: .setname <new name>');
                return;
            }
            await sock.groupUpdateSubject(jid, argsText);
            await mega.reply(m, `✅ Group name updated to: ${argsText}`);
        }
    },
    {
        name: 'setdesc',
        category: 'group',
        description: "Change the group's description",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        handler: async ({ mega, m, jid, argsText, sock }) => {
            if (!argsText) {
                await mega.reply(m, 'Usage: .setdesc <new description>');
                return;
            }
            await sock.groupUpdateDescription(jid, argsText);
            await mega.reply(m, '✅ Group description updated.');
        }
    }
];
