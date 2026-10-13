const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('team component handler acknowledges dropdowns before database and claim work', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'teams.js'), 'utf8');
  const start = source.indexOf('  async handleComponent(interaction) {');
  assert.notEqual(start, -1, 'team component handler exists');
  const end = source.indexOf('\n  }\n};', start);
  const handler = source.slice(start, end);
  const acknowledgement = handler.indexOf('await interaction.deferUpdate()');
  const databaseRead = handler.indexOf('const db = loadDatabase()');
  assert.notEqual(acknowledgement, -1, 'component acknowledgement exists');
  assert.ok(acknowledgement < databaseRead, 'acknowledgement happens before database reads');
  assert.match(handler.slice(0, databaseRead), /interaction\.isStringSelectMenu\(\)/, 'dropdowns are acknowledged too');
  assert.match(handler, /const respondPrivately = \(payload\) => interaction\.followUp/);
});
