/**
 * PresenceManager — controls how the bot appears to other WhatsApp users:
 * always online, always offline/invisible, or showing a "typing…" /
 * "recording audio…" indicator (or both, alternating) while it works on a
 * reply. Mode is read from config.PRESENCE_MODE and can be changed at
 * runtime with .presence <mode>.
 */

class PresenceManager {
    constructor(sock, config) {
        this.sock = sock;
        this.config = config;
    }

    /**
     * Races a presence call against a short timeout so a slow/hanging
     * sendPresenceUpdate() can never block command dispatch. Presence is
     * purely cosmetic — it must never be allowed to delay a real reply.
     */
    async _withTimeout(promise, ms = 3000) {
        let timer;
        try {
            await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('presence update timed out')), ms);
                })
            ]);
        } catch {
            // ignore — cosmetic only
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Sets the bot's global availability. Call once on connect, and again
     * any time the mode is changed at runtime.
     */
    async applyGlobalPresence() {
        const mode = this.config.PRESENCE_MODE;
        const target = mode === 'offline' ? 'unavailable' : 'available';
        await this._withTimeout(this.sock.sendPresenceUpdate(target));
    }

    /**
     * Fires a per-chat indicator (typing / recording / both) right before
     * the bot replies to a command. Always non-blocking and time-boxed —
     * call this WITHOUT awaiting it from the message handler so a slow or
     * hung presence update can never delay the actual command reply.
     */
    simulate(jid) {
        const mode = this.config.PRESENCE_MODE;
        if (mode === 'typing') {
            this._withTimeout(this.sock.sendPresenceUpdate('composing', jid));
        } else if (mode === 'recording') {
            this._withTimeout(this.sock.sendPresenceUpdate('recording', jid));
        } else if (mode === 'both') {
            this._withTimeout(this.sock.sendPresenceUpdate('composing', jid));
            setTimeout(() => {
                this._withTimeout(this.sock.sendPresenceUpdate('recording', jid));
            }, 600);
        }
        // 'online', 'offline', and 'off' show no per-chat indicator.
        return undefined; // explicitly synchronous — never await this in hot paths
    }

    static VALID_MODES = ['typing', 'recording', 'both', 'online', 'offline', 'off'];
}

module.exports = PresenceManager;
