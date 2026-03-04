  // SETTINGS COMMANDS
  commandstatus: async (ctx) => {
    if (!requireOwner(ctx)) return;
    
    const status = ctx.commandReactor.toggle();
    await reply(ctx, `⚡ Command status reactions: ${status ? 'ON' : 'OFF'}`);
  },

  setstatusemoji: async (ctx) => {
    if (!requireOwner(ctx)) return;
    
    const [statusType, emoji] = ctx.args;
    if (!statusType || !emoji) {
      return await reply(ctx, `❌ Usage: !setstatusemoji <type> <emoji>\n\nTypes: ${Object.keys(ctx.config.COMMAND_STATUS_EMOJIS).join(', ')}`);
    }
    
    const success = ctx.commandReactor.setEmoji(statusType.toUpperCase(), emoji);
    if (success) {
      await reply(ctx, `✅ Set ${statusType} emoji to ${emoji}`);
    } else {
      await reply(ctx, `❌ Invalid status type`);
    }
  },

  statuslist: async (ctx) => {
    if (!requireOwner(ctx)) return;
    
    const emojis = ctx.commandReactor.getEmojis();
    let text = '⚡ *Command Status Emojis*\n\n';
    
    for (const [status, emoji] of Object.entries(emojis)) {
      text += `${emoji} ${status}\n`;
    }
    
    await reply(ctx, text);
  },

