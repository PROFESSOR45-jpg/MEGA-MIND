/**
 * GroupEvents — handles non-command, event-driven group features:
 *   - AntiLink: deletes messages containing invite/group links (per-group toggle)
 *   - Welcome / Goodbye: greets joining members, notes departing ones
 *
 * These are intentionally separate from the command dispatcher since they
 * trigger on message *content* or membership *events*, not on `prefix` commands.
 */

const db = require('./database');

const LINK_PATTERN = /(https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

class GroupEvents {
    constructor(sock) {
        this.sock = sock;
    }

    /**
     * Call this for every incoming group message, before/alongside command
     * dispatch. Returns true if the message was acted on (e.g. deleted),
     * so callers can decide whether to continue processing it further.
     */
    async checkAntiLink(parsed) {
        const { isGroup, jid, text, raw: m, sender } = parsed;
        if (!isGroup) return false;

        const group = db.getGroup(jid);
        if (!group.antilink) return false;
        if (!LINK_PATTERN.test(text)) return false;

        // Admins are exempt — they're allowed to share invite links.
        try {
            const meta = await this.sock.groupMetadata(jid);
            const senderIsAdmin = meta.participants.some((p) => p.id === sender && p.admin);
            if (senderIsAdmin) return false;
        } catch {
            // If we can't check, fail safe and still enforce antilink.
        }

        try {
            await this.sock.sendMessage(jid, { delete: m.key });
            await this.sock.sendMessage(jid, {
                text: `🔗 Link removed — @${sender.split('@')[0]}, links aren't allowed here.`,
                mentions: [sender]
            });
        } catch (err) {
            console.error('AntiLink action failed:', err.message);
        }
        return true;
    }

    async handleParticipantsUpdate(update) {
        const { id: jid, participants, action } = update;
        const group = db.getGroup(jid);

        if (action === 'add' && group.welcome) {
            for (const participant of participants) {
                try {
                    const meta = await this.sock.groupMetadata(jid);
                    await this.sock.sendMessage(jid, {
                        text: `👋 Welcome @${participant.split('@')[0]} to *${meta.subject}*!`,
                        mentions: [participant]
                    });
                } catch (err) {
                    console.error('Welcome message failed:', err.message);
                }
            }
        }

        if (action === 'remove' && group.goodbye) {
            for (const participant of participants) {
                try {
                    await this.sock.sendMessage(jid, {
                        text: `👋 @${participant.split('@')[0]} has left the group.`,
                        mentions: [participant]
                    });
                } catch (err) {
                    console.error('Goodbye message failed:', err.message);
                }
            }
        }
    }
}

module.exports = GroupEvents;
