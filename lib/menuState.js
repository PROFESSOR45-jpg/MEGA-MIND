/**
 * MenuState — remembers which numbered category list was last sent to a
 * chat so that a bare "3" reply can be resolved back to a category,
 * mimicking classic "reply with a number" bot menus.
 *
 * Entries expire after a few minutes so a stray number sent long after the
 * menu was shown doesn't accidentally trigger a category.
 */

const TTL_MS = 5 * 60 * 1000;

class MenuState {
    constructor() {
        this.pending = new Map(); // jid -> { items: [{key, label}], expires }
    }

    set(jid, items) {
        this.pending.set(jid, { items, expires: Date.now() + TTL_MS });
    }

    /**
     * Resolves a plain-text reply like "3" to the matching menu item for
     * that chat, or null if there's no pending menu / it expired / the
     * text isn't a valid selection.
     */
    resolve(jid, text) {
        const entry = this.pending.get(jid);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            this.pending.delete(jid);
            return null;
        }
        const trimmed = (text || '').trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const index = parseInt(trimmed, 10) - 1;
        if (index < 0 || index >= entry.items.length) return null;
        return entry.items[index];
    }

    clear(jid) {
        this.pending.delete(jid);
    }
}

module.exports = new MenuState();
