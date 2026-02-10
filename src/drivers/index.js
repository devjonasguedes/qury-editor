const { createMySqlDriver } = require('./mysql');
const { createPostgresDriver } = require('./postgres');
const { createSqliteDriver } = require('./sqlite');

function createDriver(type, deps) {
  const raw = String(type || '').toLowerCase();
  const normalized = raw === 'postgres'
    ? 'postgresql'
    : raw === 'maria' || raw === 'maria-db'
      ? 'mariadb'
      : raw === 'sqlite3'
        ? 'sqlite'
        : raw;
  if (normalized === 'mysql' || normalized === 'mariadb') return createMySqlDriver(deps);
  if (normalized === 'postgresql') return createPostgresDriver(deps);
  if (normalized === 'sqlite') return createSqliteDriver(deps);
  throw new Error('Unsupported database type.');
}

module.exports = {
  createDriver
};
