const test = require('node:test');
const assert = require('node:assert/strict');
const { previewOffseason, applyOffseason } = require('../utils/offseasonProgression');
function dynasty() { return { season: 4, seasonClosed: true, rosterPlayers: [
  { name: 'Fresh', team: 'A', position: 'QB', classYear: 'FR' },
  { name: 'Senior', team: 'A', position: 'RB', classYear: 'SR' },
  { name: 'Redshirt', team: 'B', position: 'WR', classYear: 'RS-JR' }
], recruitingProspects: [{ name: 'New Kid', team: 'A', position: 'CB', stars: 4, season: 5, status: 'Signed' }] }; }
test('preview identifies advancing, graduating, and signed incoming players without mutation', () => { const d = dynasty(); const p = previewOffseason(d); assert.equal(p.advancing.length, 2); assert.equal(p.graduating.length, 1); assert.equal(p.signedProspects.length, 1); assert.equal(d.rosterPlayers[0].classYear, 'FR'); });
test('apply advances classes, archives graduates, and enrolls signed prospects', () => { const d = dynasty(); const r = applyOffseason(d, 'staff'); assert.equal(r.transition.graduated, 1); assert.equal(d.rosterPlayers.find(p => p.name === 'Fresh').classYear, 'SO'); assert.equal(d.rosterPlayers.find(p => p.name === 'Redshirt').classYear, 'RS-SR'); assert.equal(d.rosterPlayers.find(p => p.name === 'New Kid').classYear, 'FR'); assert.equal(d.recruitingProspects[0].status, 'Enrolled'); assert.equal(d.graduatedPlayers[0].name, 'Senior'); });
test('cannot apply before season close', () => { const d = dynasty(); d.seasonClosed = false; assert.match(applyOffseason(d, 'staff').error, /Close the current season/); });
test('transition is idempotently blocked on repeat', () => { const d = dynasty(); applyOffseason(d, 'staff'); assert.match(applyOffseason(d, 'staff').error, /already been applied/); assert.equal(d.rosterPlayers.filter(p => p.name === 'New Kid').length, 1); });
test('duplicate signed prospects block transition', () => { const d = dynasty(); d.recruitingProspects.push({ ...d.recruitingProspects[0] }); assert.match(applyOffseason(d, 'staff').error, /Duplicate signed prospect/); });
test('unknown class years block transition for manual review', () => { const d = dynasty(); d.rosterPlayers.push({ name: 'Mystery', team: 'A', position: 'QB', classYear: '??' }); assert.match(applyOffseason(d, 'staff').error, /unknown class year/); });
