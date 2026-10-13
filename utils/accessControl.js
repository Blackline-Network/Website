'use strict';

const DEFAULT_MANAGER_ROLES = ['Commissioner', 'Dynasty Manager', 'League Manager'];

function configuredManagerRoles(raw = process.env.DYNASTY_MANAGER_ROLES) {
  const values = raw == null ? DEFAULT_MANAGER_ROLES : String(raw).split(',');
  return values.map(value => value.trim()).filter(Boolean);
}

function hasManagerAccess(interaction, configuredRoles = configuredManagerRoles()) {
  if (interaction?.memberPermissions?.has?.('Administrator')) return true;
  const roles = interaction?.member?.roles?.cache;
  if (!roles || typeof roles.some !== 'function') return false;
  return roles.some(role => configuredRoles.includes(role.name) || configuredRoles.includes(role.id));
}

module.exports = { DEFAULT_MANAGER_ROLES, configuredManagerRoles, hasManagerAccess };
