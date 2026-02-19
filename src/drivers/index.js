const { createMySqlDriver } = require('./mysql');
const { createPostgresDriver } = require('./postgres');
const { createSqliteDriver } = require('./sqlite');

function createDriver(type, deps) {
  const raw = String(type || '').toLowerCase();
  const normalized = raw === 'postgres'
    ? 'postgresql'
    : raw === 'sqlite3'
        ? 'sqlite'
        : raw;
  if (normalized === 'mysql') return createMySqlDriver(deps);
  if (normalized === 'postgresql') return createPostgresDriver(deps);
  if (normalized === 'sqlite') return createSqliteDriver(deps);
  throw new Error('Unsupported database type.');
}

module.exports = {
  createDriver
};
