'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('league slash command stays within Discord maximum of 25 subcommands', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'league.js'), 'utf8');
  const count = (source.match(/\.addSubcommand\(/g) || []).length;
  assert.ok(count <= 25, `Discord allows at most 25 subcommands; found ${count}`);
});
