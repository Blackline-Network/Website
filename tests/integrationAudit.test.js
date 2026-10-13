'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function loadCommandDefinitions() {
  const directory = path.join(root, 'commands');
  return fs.readdirSync(directory).filter(file => file.endsWith('.js')).map(file => {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    const match = source.match(/data\s*:\s*new SlashCommandBuilder\(\)\s*\.setName\(['"]([^'"]+)['"]\)/);
    return match ? { file, name: match[1] } : null;
  }).filter(Boolean);
}

test('all top-level slash command names are unique and within Discord guild limits', () => {
  const definitions = loadCommandDefinitions();
  const names = definitions.map(item => item.name);
  assert.ok(definitions.length > 0, 'at least one command should be registered');
  assert.equal(new Set(names).size, names.length,
    `duplicate top-level command names: ${names.filter((name, index) => names.indexOf(name) !== index).join(', ')}`);
  assert.ok(definitions.length <= 100, `Discord guild command limit is 100; found ${definitions.length}`);
});

test('every public component family has a central interaction route', () => {
  const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const routeFamilies = [
    'blackline_poll_vote:',
    'blackline_coach_',
    'blackline_score_review:',
    'blackline_competition_',
    'blackline_history_',
    'blackline_dispute_',
    'blackline_readiness_',
    'blackline_team_'
  ];
  for (const prefix of routeFamilies) assert.ok(source.includes(prefix), `missing interaction route for ${prefix}`);
});

test('interaction handler acknowledges errors without assuming the interaction is unacknowledged', () => {
  const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  assert.match(source, /if\s*\(interaction\.replied\s*\|\|\s*interaction\.deferred\)/);
  assert.match(source, /interaction\.followUp\(/);
  assert.match(source, /interaction\.reply\(/);
});

test('guild command registration uses a single bulk overwrite and reports partial failures', () => {
  const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  assert.match(source, /rest\.put\(Routes\.applicationGuildCommands\(applicationId, guild\.id\), \{ body: commands \}\)/);
  assert.match(source, /registeredGuilds !== guilds\.length/);
  assert.match(source, /Duplicate BLACKLINE slash command name/);
});

test('Fix 140 community feed uses authenticated, CSRF-protected persistent posts', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '../blackline-website/server.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../blackline-website/public/community.html'), 'utf8');
  const client = fs.readFileSync(path.join(__dirname, '../blackline-website/public/community.js'), 'utf8');
  assert.match(server, /WEBSITE_COMMUNITY_PATH/);
  assert.match(server, /\/api\/community\/posts/);
  assert.match(server, /requireAuth\(req,res\)/);
  assert.match(server, /requireCsrf\(req,res,s\)/);
  assert.match(server, /community-post/);
  assert.match(server, /atomicJsonWrite\(COMMUNITY_PATH/);
  assert.match(server, /valid HTTPS URLs/);
  assert.match(page, /Creator Feed/);
  assert.match(client, /\/api\/community\/posts/);
  assert.match(client, /rel="noopener noreferrer"/);
});
