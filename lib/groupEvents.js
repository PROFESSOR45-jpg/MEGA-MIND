/**
 * GroupEvents — handles non-command, event-driven group features:
 *   - AntiLink: deletes messages containing invite/group links (per-group toggle)
 *   - AntiForward: deletes forwarded messages (per-group toggle)
 *   - Welcome / Goodbye: greets joining members, notes departing ones
 *
 * These are intentionally separate from the command dispatcher since they
 * trigger on message *content* or membership *events*, not on `prefix` commands.
 */

const db = require('./database');

const LINK_PATTERN = /(https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

const DEFAULT_WELCOME = '👋 Welcome @{user} to *{group}*!';
const DEFAULT_GOODBYE = '👋 @{user} has left the group.';

function renderTemplate(template, { user, group, count }) {
    return template
        .replace(/\{user\}/g, `@${user.split('@')[0]}`)
        .replace(/\{group\}/g, group || 'this group')
        .replace(/\{count\}/g, String(count ?? ''))
        .trim();
}

function isForwarded(m) {
    const ctx = m.message?.extendedTextMessage?.contextInfo
        || m.message?.imageMessage?.contextInfo
        || m.message?.videoMessage?.contextInfo
        || m.message?.documentMessage?.contextInfo;
    if (!ctx) return false;
    return ctx.isForwarded === true || Number(ctx.forwardingScore) > 0;
}

class GroupEvents {
    constructor(sock) {
        this.sock = sock;
    }

    async senderIsAdmin(jid, sender) {
        try {
            const meta = await this.sock.groupMetadata(jid);
            return meta.participants.some((p) => p.id === sender && p.admin);
        } catch {
            // Fail safe: if we can't verify, treat as non-admin so moderation
            // stays enforced.
            return false;
        }
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
        if (await this.senderIsAdmin(jid, sender)) return false;

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

    async checkAntiForward(parsed) {
        const { isGroup, jid, raw: m, sender } = parsed;
        if (!isGroup) return false;

        const group = db.getGroup(jid);
        if (!group.antiforward) return false;
        if (!isForwarded(m)) return false;

        if (await this.senderIsAdmin(jid, sender)) return false;

        try {
            await this.sock.sendMessage(jid, { delete: m.key });
            await this.sock.sendMessage(jid, {
                text: `➡️ Forwarded message removed — @${sender.split('@')[0]}, forwarding isn't allowed here.`,
                mentions: [sender]
            });
        } catch (err) {
            console.error('AntiForward action failed:', err.message);
        }
        return true;
    }

    async handleParticipantsUpdate(update) {
        const { id: jid, participants, action } = update;
        const group = db.getGroup(jid);

        const wants = (action === 'add' && group.welcome)
            || (action === 'remove' && group.goodbye);
        if (!wants) return;

        let meta = null;
        try {
            meta = await this.sock.groupMetadata(jid);
        } catch (err) {
            console.error('Group metadata fetch failed:', err.message);
        }
        const count = meta?.participants?.length;

        const template = action === 'add'
            ? (group.welcomeText || DEFAULT_WELCOME)
            : (group.goodbyeText || DEFAULT_GOODBYE);

        for (const participant of participants) {
            try {
                await this.sock.sendMessage(jid, {
                    text: renderTemplate(template, {
                        user: participant,
                        group: meta?.subject,
                        count
                    }),
                    mentions: [participant]
                });
            } catch (err) {
                console.error(`${action === 'add' ? 'Welcome' : 'Goodbye'} message failed:`, err.message);
            }
        }
    }
}

module.exports = GroupEvents;
