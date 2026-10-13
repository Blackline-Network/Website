'use strict';

/** Send one user-facing response using the interaction's current acknowledgement state. */
async function respondToInteraction(interaction, payload) {
  if (!interaction || interaction.isRepliable?.() === false) {
    return { ok: false, reason: 'not-repliable' };
  }
  try {
    if (interaction.deferred || interaction.replied) {
      if (typeof interaction.editReply === 'function') {
        await interaction.editReply(payload);
        return { ok: true, method: 'editReply' };
      }
      if (typeof interaction.followUp === 'function') {
        await interaction.followUp(payload);
        return { ok: true, method: 'followUp' };
      }
      return { ok: false, reason: 'no-response-method' };
    }
    if (typeof interaction.reply === 'function') {
      await interaction.reply(payload);
      return { ok: true, method: 'reply' };
    }
    return { ok: false, reason: 'no-response-method' };
  } catch (error) {
    // Discord may reject a response after the interaction token expires. Do not
    // retry with another acknowledgement method: that can create duplicate replies.
    return { ok: false, reason: error?.code === 10062 ? 'interaction-expired' : 'discord-response-failed', error };
  }
}

module.exports = { respondToInteraction };
