'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configuredManagerRoles, hasManagerAccess, DEFAULT_MANAGER_ROLES } = require('../utils/accessControl');

test('default manager roles are available when no configuration is supplied', () => {
  assert.deepEqual(configuredManagerRoles(undefined), DEFAULT_MANAGER_ROLES);
});
test('configured manager roles are trimmed and empty values removed', () => {
  assert.deepEqual(configuredManagerRoles(' Commissioner, 12345, ,League Manager '), ['Commissioner', '12345', 'League Manager']);
});
test('manager access accepts a configured role name or role ID', () => {
  assert.equal(hasManagerAccess({ member: { roles: { cache: [{ name: 'Dynasty Manager', id: '1' }] } } }), true);
  assert.equal(hasManagerAccess({ member: { roles: { cache: [{ name: 'Other', id: '12345' }] } } }, ['12345']), true);
});
test('administrator permission grants access without role cache', () => {
  assert.equal(hasManagerAccess({ memberPermissions: { has: p => p === 'Administrator' } }, []), true);
});
test('ordinary members and incomplete interactions are denied', () => {
  assert.equal(hasManagerAccess({ member: { roles: { cache: [{ name: 'Coach', id: '3' }] } } }), false);
  assert.equal(hasManagerAccess({}), false);
  assert.equal(hasManagerAccess({ member: { roles: { cache: null } } }), false);
});
