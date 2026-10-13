'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { diagnoseTeamClaimNotifications } = require('../utils/teamClaimNotificationDiagnostics');
const { getNotificationHealth, setNotificationRetentionLimit, MIN_HEALTH_LIMIT, MAX_HEALTH_LIMIT } = require('../utils/teamClaimNotifications');
const MANAGER_ROLES = (process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager').split(',').map(x => x.trim()).filter(Boolean);
function csvCell(value) {
  let text = String(value ?? '');
  // Guard spreadsheet applications against formula injection in exported text.
  if (/^[\s\u0000-\u001f]*[=+@\-]/.test(text)) text = `'${text}`;
  return `\"${text.replace(/\"/g, '\"\"')}\"`;
}
function isManager(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = interaction.member?.roles?.cache;
  return Boolean(roles && roles.some(role => MANAGER_ROLES.includes(role.name) || MANAGER_ROLES.includes(role.id)));
}
module.exports = {
  data: new SlashCommandBuilder().setName('teamnotifications').setDescription('Diagnose team-claim notification delivery.')
    .addSubcommand(s => s.setName('status').setDescription('Check channel configuration, permissions, and event switches.'))
    .addSubcommand(s => s.setName('test').setDescription('Send a test embed to the configured team-claim notification channel.'))
    .addSubcommand(s => s.setName('health').setDescription('View notification delivery outcomes and counters.'))
    .addSubcommand(s => s.setName('summary').setDescription('View a compact notification delivery summary for managers.'))
    .addSubcommand(s => s.setName('alerts').setDescription('Check for repeated notification failures and configuration problems.'))
    .addSubcommand(s => s.setName('timeline').setDescription('View the notification incident timeline and recovery state.')
      .addIntegerOption(o => o.setName('limit').setDescription('Number of recent timeline events (1–20).').setMinValue(1).setMaxValue(20)))
    .addSubcommand(s => s.setName('history').setDescription('Browse recent notification events and failures.')
      .addStringOption(o => o.setName('outcome').setDescription('Filter by delivery outcome.').addChoices({ name: 'Failed', value: 'failed' }, { name: 'Sent', value: 'sent' }, { name: 'Skipped', value: 'skipped' }))
      .addStringOption(o => o.setName('event').setDescription('Filter by event type.').addChoices({ name: 'Team claimed', value: 'team_claimed' }, { name: 'Team released', value: 'team_released' }, { name: 'Repair applied', value: 'repair_applied' }))
      .addIntegerOption(o => o.setName('limit').setDescription('Number of events to show (1–25).').setMinValue(1).setMaxValue(25)))
    .addSubcommand(s => s.setName('retention').setDescription('View or configure how many notification events are retained.')
      .addIntegerOption(o => o.setName('limit').setDescription('Number of recent events to retain (10–500).').setMinValue(MIN_HEALTH_LIMIT).setMaxValue(MAX_HEALTH_LIMIT)))
    .addSubcommand(s => s.setName('export').setDescription('Export recent notification history as a CSV attachment.')
      .addStringOption(o => o.setName('outcome').setDescription('Filter by delivery outcome.').addChoices({ name: 'Failed', value: 'failed' }, { name: 'Sent', value: 'sent' }, { name: 'Skipped', value: 'skipped' }))
      .addStringOption(o => o.setName('event').setDescription('Filter by event type.').addChoices({ name: 'Team claimed', value: 'team_claimed' }, { name: 'Team released', value: 'team_released' }, { name: 'Repair applied', value: 'repair_applied' }))
      .addIntegerOption(o => o.setName('limit').setDescription('Number of events to export (1–50).').setMinValue(1).setMaxValue(50))),
  async execute(interaction) {
    if (!isManager(interaction)) return interaction.reply({ content: '🔒 Only league staff can inspect or test team-claim notifications.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'retention') {
      const requestedLimit = interaction.options.getInteger('limit');
      if (requestedLimit !== null) {
        try {
          const savedLimit = setNotificationRetentionLimit(requestedLimit);
          return interaction.editReply(`✅ Notification history retention set to **${savedLimit} events**. Existing history was trimmed only if it exceeded the new limit.`);
        } catch (error) {
          return interaction.editReply(`❌ Could not save the retention setting: ${String(error?.message || error).slice(0, 250)}`);
        }
      }
      const health = getNotificationHealth();
      return interaction.editReply(`Notification history currently retains up to **${health.capacity} events**. Choose a limit from **${MIN_HEALTH_LIMIT}** to **${MAX_HEALTH_LIMIT}** to change it.`);
    }
    if (subcommand === 'export') {
      const health = getNotificationHealth();
      const outcomeFilter = interaction.options.getString('outcome');
      const eventFilter = interaction.options.getString('event');
      const requestedLimit = interaction.options.getInteger('limit') ?? 50;
      const limit = Math.max(1, Math.min(50, requestedLimit));
      const rows = health.recent.filter(item => (!outcomeFilter || item.outcome === outcomeFilter) && (!eventFilter || item.event === eventFilter)).slice(0, limit);
      const headers = ['timestamp_utc', 'event', 'outcome', 'reason', 'error_code'];
      const csv = [headers, ...rows.map(item => [item.at, item.event, item.outcome, item.reason || '', item.code || ''])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
      const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `blackline-notification-history-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`, description: 'Recent BLACKLINE team notification events' });
      return interaction.editReply({ content: `Exported **${rows.length}** matching notification event(s) from local history.`, files: [attachment] });
    }
    if (subcommand === 'timeline') {
      const health = getNotificationHealth();
      const requestedLimit = interaction.options.getInteger('limit') ?? 12;
      const limit = Math.max(1, Math.min(20, requestedLimit));
      const events = health.recent.slice(0, limit).slice().reverse();
      const timeline = events.map(item => {
        const time = item.at && !Number.isNaN(Date.parse(item.at))
          ? new Date(item.at).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
          : 'unknown time';
        const symbol = item.outcome === 'failed' ? '🔴' : item.outcome === 'sent' ? '🟢' : '⚪';
        const details = [item.reason, item.code ? `code ${item.code}` : null].filter(Boolean).join(' · ');
        return `${symbol} **${time}** — ${item.event}: ${item.outcome}${details ? `\n${details}` : ''}`;
      });
      const incident = health.incidentActive
        ? `🔴 **Incident active** since ${health.incidentStartedAt || 'unknown time'}; waiting for a successful normal notification to confirm recovery.`
        : '🟢 **No active incident recorded.**';
      const embed = new EmbedBuilder()
        .setColor(health.incidentActive ? 0xe74c3c : events.some(item => item.outcome === 'failed') ? 0xe67e22 : 0x2ecc71)
        .setTitle('BLACKLINE · Notification Incident Timeline')
        .setDescription(`${incident}\n\n${timeline.join('\n\n') || 'No notification events have been retained yet.'}`.slice(0, 4000))
        .setFooter({ text: `Chronological view of the latest ${events.length} retained events • /teamnotifications history for filters` })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    if (subcommand === 'history') {
      const health = getNotificationHealth();
      const outcomeFilter = interaction.options.getString('outcome');
      const eventFilter = interaction.options.getString('event');
      const requestedLimit = interaction.options.getInteger('limit') ?? 10;
      const limit = Math.max(1, Math.min(25, requestedLimit));
      const matches = health.recent.filter(item => (!outcomeFilter || item.outcome === outcomeFilter) && (!eventFilter || item.event === eventFilter));
      const rows = matches.slice(0, limit);
      const outcomeLabel = outcomeFilter ? ` · ${outcomeFilter}` : '';
      const eventLabel = eventFilter ? ` · ${eventFilter}` : '';
      const body = rows.length ? rows.map((item, index) => {
        const date = item.at && !Number.isNaN(Date.parse(item.at)) ? new Date(item.at).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') : 'unknown time';
        const details = [item.reason, item.code ? `code ${item.code}` : null].filter(Boolean).join(' · ');
        return `**${index + 1}. ${item.event} — ${item.outcome}**\n${date}${details ? `\n${details}` : ''}`;
      }).join('\n\n').slice(0, 3900) : 'No notification events match those filters.';
      const embed = new EmbedBuilder().setColor(rows.some(item => item.outcome === 'failed') ? 0xe67e22 : 0x5865f2)
        .setTitle('Team-Claim Notification History')
        .setDescription(`Showing ${rows.length} of ${matches.length} matching saved events${outcomeLabel}${eventLabel}.\n\n${body}`)
        .setFooter({ text: `Local history retains up to ${health.capacity} recent events. Use /teamnotifications health for totals.` }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    if (subcommand === 'summary') {
      const health = getNotificationHealth();
      const t = health.totals;
      const denominator = t.sent + t.failed;
      const successRate = denominator ? Math.round((t.sent / denominator) * 100) : null;
      const eventNames = { team_claimed: 'Team claims', team_released: 'Team releases', repair_applied: 'Applied repairs' };
      const eventLines = Object.entries(health.byEvent).sort(([a], [b]) => a.localeCompare(b)).map(([event, counts]) => {
        const label = eventNames[event] || event.replace(/_/g, ' ');
        return `• **${label}** — sent ${counts.sent || 0}, failed ${counts.failed || 0}, skipped ${counts.skipped || 0}`;
      });
      const latestFailure = health.recent.find(item => item.outcome === 'failed');
      const failureLine = latestFailure
        ? `${latestFailure.event}: ${latestFailure.reason || 'failed'}${latestFailure.code ? ` (code ${latestFailure.code})` : ''} · ${latestFailure.at || 'unknown time'}`.slice(0, 1024)
        : 'No failed events in retained history.';
      const embed = new EmbedBuilder().setColor(t.failed ? 0xe67e22 : 0x2ecc71).setTitle('BLACKLINE · Notification Summary')
        .setDescription(`**Channel configured:** ${health.configured ? 'yes' : 'no'}\n**Retained history:** ${health.recent.length}/${health.capacity} events\n**Delivery success rate:** ${successRate === null ? 'not enough delivery data' : `${successRate}%`}`)
        .addFields(
          { name: 'Overall totals', value: `Attempted: **${t.attempted}**\nSent: **${t.sent}**\nFailed: **${t.failed}**\nSkipped: **${t.skipped}**`, inline: true },
          { name: 'By event type', value: eventLines.join('\n').slice(0, 1024) || 'No event outcomes recorded yet.', inline: true },
          { name: 'Most recent retained failure', value: failureLine }
        ).setFooter({ text: 'Local persisted telemetry • /teamnotifications history for event details' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    if (subcommand === 'alerts') {
      const health = getNotificationHealth();
      const configuredThreshold = Number.parseInt(process.env.TEAM_CLAIM_ALERT_FAILURE_THRESHOLD || '3', 10);
      const threshold = Number.isInteger(configuredThreshold) ? Math.max(1, Math.min(10, configuredThreshold)) : 3;
      const sample = health.recent.slice(0, 10);
      const failures = sample.filter(item => item.outcome === 'failed');
      const latestFailure = failures[0];
      const problems = [];
      if (!health.configured) problems.push('Notification channel is not configured.');
      if (failures.length >= threshold) problems.push(`${failures.length} failures among the latest ${sample.length} retained events (alert threshold: ${threshold}).`);
      if (latestFailure) problems.push(`Latest failure: ${latestFailure.event} — ${latestFailure.reason || 'failed'}${latestFailure.code ? ` (code ${latestFailure.code})` : ''}.`);
      const status = !health.configured || failures.length >= threshold ? 'attention needed' : failures.length ? 'warning' : 'healthy';
      const embed = new EmbedBuilder().setColor(status === 'healthy' ? 0x2ecc71 : status === 'warning' ? 0xe67e22 : 0xe74c3c)
        .setTitle('BLACKLINE · Notification Health Alerts')
        .setDescription(`**Status:** ${status}
**Channel configured:** ${health.configured ? 'yes' : 'no'}
**Recent sample:** ${sample.length} events
**Failure threshold:** ${threshold} of the latest 10 events`)
        .addFields({ name: 'Findings', value: problems.length ? problems.join('\n').slice(0, 1024) : 'No current alert conditions detected in retained history.' })
        .setFooter({ text: 'This command evaluates local retained history; it does not send proactive alerts.' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    if (subcommand === 'health') {
      const health = getNotificationHealth();
      const t = health.totals;
      const recentFailures = health.recent.filter(item => item.outcome === 'failed').slice(0, 8);
      const failureText = recentFailures.length ? recentFailures.map(item => `• ${item.event} — ${item.reason || 'failed'}${item.code ? ` (code ${item.code})` : ''} — ${item.at}`).join('\n').slice(0, 1024) : 'No recent delivery failures recorded in this process.';
      const embed = new EmbedBuilder().setColor(t.failed ? 0xe67e22 : 0x2ecc71).setTitle('Team-Claim Notification Health')
        .setDescription(`**Channel configured:** ${health.configured ? 'yes' : 'no'}\n**Persistent history:** latest ${health.recent.length}/${health.capacity} events (saved locally across restarts)`)
        .addFields({ name: 'Delivery totals', value: `Attempted: **${t.attempted}**\nSent: **${t.sent}**\nFailed: **${t.failed}**\nSkipped: **${t.skipped}**`, inline: true }, { name: 'Recent failures', value: failureText })
        .setFooter({ text: 'Counters persist across restarts on this host; use /teamnotifications status for configuration checks.' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    const diagnosis = await diagnoseTeamClaimNotifications(interaction.client, { guild: interaction.guild });
    if (subcommand === 'test') {
      if (!diagnosis.channelFound || !diagnosis.textBased) return interaction.editReply(`❌ Test not sent. Status: **${diagnosis.status}**. ${diagnosis.advice.join(' ')}`);
      try {
        const channel = await interaction.client.channels.fetch(diagnosis.channelId);
        await channel.send({ embeds: [new EmbedBuilder().setColor(diagnosis.status === 'ready' ? 0x2ecc71 : 0xe67e22).setTitle('BLACKLINE · Team Notification Test').setDescription('This test confirms the bot can send a team-claim notification embed.').addFields({ name: 'Diagnostic status', value: diagnosis.status }).setTimestamp()], allowedMentions: { parse: [] } });
        return interaction.editReply(`✅ Test embed sent to <#${diagnosis.channelId}>. This confirms message delivery at the time of the test.`);
      } catch (error) {
        return interaction.editReply(`❌ Test delivery failed (${String(error?.code || error?.message || 'unknown error').slice(0, 160)}). Check View Channel, Send Messages, and Embed Links permissions.`);
      }
    }
    const eventLines = Object.entries(diagnosis.events).map(([event, enabled]) => `• ${event}: **${enabled ? 'enabled' : 'disabled'}**`).join('\n');
    const permissionLines = Object.entries(diagnosis.permissions).map(([permission, value]) => `• ${permission}: **${value === null ? 'unverified' : value ? 'yes' : 'missing'}**`).join('\n');
    const embed = new EmbedBuilder().setColor(diagnosis.status === 'ready' ? 0x2ecc71 : 0xe67e22).setTitle('Team-Claim Notification Diagnostics')
      .setDescription(`**Status:** ${diagnosis.status}\n**Configured:** ${diagnosis.configured ? 'yes' : 'no'}\n**Channel reachable:** ${diagnosis.channelFound ? 'yes' : 'no'}`)
      .addFields({ name: 'Event switches', value: eventLines }, { name: 'Permissions', value: permissionLines }, { name: 'Recommended next steps', value: diagnosis.advice.join('\n').slice(0, 1024) || 'No action suggested.' }).setFooter({ text: 'Checks do not guarantee future Discord API availability.' }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
};
