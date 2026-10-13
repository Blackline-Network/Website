const { SlashCommandBuilder } = require('discord.js');

// Keeps the league command within Discord's 25-subcommand limit.
// Execution delegates to the existing league handler so validation, persistence,
// audit logging, and responses remain centralized and are not duplicated.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('league-admin')
        .setDescription('Staff tools for season, conference, and playoff administration.')
        .addSubcommand(s => s.setName('season-close').setDescription('Close a completed season after all games and championship are finalized.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('season-start').setDescription('Start the next season after the prior season has been closed.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('conference-set').setDescription('Assign a registered team to a conference.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addStringOption(o => o.setName('team').setDescription('Registered team name').setRequired(true))
            .addStringOption(o => o.setName('conference').setDescription('Conference name (for example, ACC)').setRequired(true)))
        .addSubcommand(s => s.setName('playoff-qualify').setDescription('Select the 12 playoff teams from conference champions and at-large bids.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('playoff-setup').setDescription('Create or reset the current season 12-team playoff bracket.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('playoff-bracket').setDescription('View the current season playoff bracket.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('playoff-result').setDescription('Record a playoff result; winner advances automatically.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addIntegerOption(o => o.setName('round').setDescription('Playoff round number (1 is the first round)').setRequired(true).setMinValue(1).setMaxValue(4))
            .addStringOption(o => o.setName('home').setDescription('Home team exactly as shown in the bracket').setRequired(true))
            .addStringOption(o => o.setName('away').setDescription('Away team exactly as shown in the bracket').setRequired(true))
            .addIntegerOption(o => o.setName('home-score').setDescription('Home team final score').setRequired(true).setMinValue(0).setMaxValue(300))
            .addIntegerOption(o => o.setName('away-score').setDescription('Away team final score').setRequired(true).setMinValue(0).setMaxValue(300))),
    async execute(interaction) {
        return require('./league').execute(interaction);
    }
};
