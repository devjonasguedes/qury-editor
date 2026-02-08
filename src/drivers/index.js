const { createMySqlDriver } = require('./mysql');
const { createPostgresDriver } = require('./postgres');

function createDriver(type, deps) {
  const raw = String(type || '').toLowerCase();
  const normalized = raw === 'postgres' ? 'postgresql' : raw === 'maria' || raw === 'maria-db' ? 'mariadb' : raw;
  if (normalized === 'mysql' || normalized === 'mariadb') return createMySqlDriver(deps);
  if (normalized === 'postgresql') return createPostgresDriver(deps);
  throw new Error('Unsupported database type.');
}

module.exports = {
  createDriver
};
