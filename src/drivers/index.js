const { createMySqlDriver } = require('./mysql');
const { createPostgresDriver } = require('./postgres');

function createDriver(type, deps) {
  const normalized = type === 'postgres' ? 'postgresql' : type;
  if (normalized === 'mysql') return createMySqlDriver(deps);
  if (normalized === 'postgresql') return createPostgresDriver(deps);
  throw new Error('Tipo de banco não suportado.');
}

module.exports = {
  createDriver
};
