/**
 * CommandHandler — loads every command module from /commands, and routes
 * incoming parsed messages to the right one, enforcing permissions,
 * cooldowns, and group/admin/owner requirements along the way.
 *
 * Each command module exports an array of command definitions:
 *   {
 *     name: 'ping',
 *     aliases: ['p'],
 *     category: 'general',
 *     description: 'Check if the bot is responsive',
 *     ownerOnly: false,
 *     adminOnly: false,
 *     groupOnly: false,
 *     privateOnly: false,
 *     cooldown: 0, // seconds, overrides config default if set
 *     handler: async (ctx) => { ... }
 *   }
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');

class CommandHandler {
    constructor(sock, config, mega, commandReactor) {
        this.sock = sock;
        this.config = config;
        this.mega = mega;
        this.commandReactor = commandReactor;
        this.commands = new Map(); // name/alias -> definition
        this.categories = new Map(); // category -> [definitions]
        this.loadCommands();
    }

    loadCommands() {
        const dir = path.join(__dirname, '..', 'commands');
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

        for (const file of files) {
            const defs = require(path.join(dir, file));
            const list = Array.isArray(defs) ? defs : [defs];

            for (const def of list) {
                if (!def?.name || typeof def.handler !== 'function') {
                    console.warn(`⚠️  Skipping malformed command export in ${file}`);
                    continue;
                }
                this.commands.set(def.name, def);
                for (const alias of def.aliases || []) {
                    this.commands.set(alias, def);
                }
                const category = def.category || 'misc';
                if (!this.categories.has(category)) this.categories.set(category, []);
                this.categories.get(category).push(def);
            }
        }

        console.log(`📦 Loaded ${[...new Set(this.commands.values())].length} commands across ${this.categories.size} categories`);
    }

    getCommand(name) {
        return this.commands.get(name);
    }

    getCategories() {
        return this.categories;
    }

    async dispatch(parsed) {
        const { command, raw: m, isGroup, sender } = parsed;
        const def = this.getCommand(command);
        if (!def) return;

        db.incrementCommand();

        const access = await this.mega.checkAccess(m, isGroup);
        if (!access.allowed) {
            if (access.level === 'banned') {
                await this.commandReactor.react(m, 'BANNED');
            }
            // MODE-restricted: stay silent rather than confirming the bot
            // exists/works to people who shouldn't be using it.
            return;
        }

        if (def.ownerOnly && access.level !== 'owner') {
            await this.commandReactor.react(m, 'OWNER_ONLY');
            await this.mega.reply(m, this.config.MESSAGES.OWNER_ONLY);
            return;
        }

        if (def.groupOnly && !isGroup) {
            await this.commandReactor.react(m, 'GROUP_ONLY');
            await this.mega.reply(m, this.config.MESSAGES.GROUP_ONLY);
            return;
        }

        if (def.adminOnly && isGroup && access.level !== 'owner' && access.level !== 'admin') {
            await this.commandReactor.react(m, 'ADMIN_ONLY');
            await this.mega.reply(m, this.config.MESSAGES.ADMIN_ONLY);
            return;
        }

        if (def.requireBotAdmin && isGroup) {
            const botIsAdmin = await this.mega.isBotAdmin(parsed.jid);
            if (!botIsAdmin) {
                await this.mega.reply(m, this.config.MESSAGES.BOT_NOT_ADMIN);
                return;
            }
        }

        const cooldownSeconds = def.cooldown ?? this.config.COMMAND_COOLDOWN_SECONDS;
        if (cooldownSeconds > 0 && access.level !== 'owner') {
            const remaining = db.checkCooldown(sender, def.name);
            if (remaining > 0) {
                await this.commandReactor.react(m, 'COOLDOWN');
                await this.mega.reply(m, `⏱️ Wait ${remaining}s before using *${def.name}* again.`);
                return;
            }
            db.setCooldown(sender, def.name, cooldownSeconds);
        }

        await this.commandReactor.react(m, 'PROCESSING');

        try {
            await def.handler({
                sock: this.sock,
                config: this.config,
                mega: this.mega,
                m,
                ...parsed,
                accessLevel: access.level,
                commandHandlerRef: this
            });
            await this.commandReactor.react(m, 'SUCCESS');
        } catch (err) {
            console.error(`Command "${def.name}" error:`, err);
            await this.commandReactor.react(m, 'ERROR');
            await this.mega.reply(m, `❌ Something went wrong running *${def.name}*.`).catch(() => {});
        }
    }
}

module.exports = CommandHandler;
