const { createDriver } = require('../drivers');

function generateId(prefix) {
  return `${prefix || 'id'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Simple in-memory driver registry for scaffold/demo purposes.
const drivers = new Map();

function registerDbHandlers(ipcMain, opts = {}) {
  // opts can include logger, deps to pass into driver factory, etc.
  const deps = opts.deps || {};

  ipcMain.handle('db:connect', async (_evt, config) => {
    const connectionId = generateId('conn');
    try {
      const driver = createDriver(config.type, deps);
      if (typeof driver.connect !== 'function') {
        throw new Error('Driver does not implement connect()');
      }
      await driver.connect(config);
      drivers.set(connectionId, { driver, config });
      return { ok: true, connectionId };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('db:disconnect', async (_evt, payload) => {
    const id = payload && payload.connectionId;
    // fallback: disconnect all
    if (!id) {
      for (const [k, v] of drivers) {
        try {
          if (v.driver && typeof v.driver.disconnect === 'function') {
            await v.driver.disconnect();
          }
        } catch (_) {}
        drivers.delete(k);
      }
      return { ok: true };
    }
    const entry = drivers.get(id);
    if (!entry) return { ok: false, error: 'connection not found' };
    try {
      if (entry.driver && typeof entry.driver.disconnect === 'function') {
        await entry.driver.disconnect();
      }
    } catch (err) {
      return { ok: false, error: String(err) };
    }
    drivers.delete(id);
    return { ok: true };
  });

  ipcMain.handle('db:runQuery', async (_evt, payload) => {
    // payload should include connectionId and sql
    const connectionId = payload && payload.connectionId;
    const sql = payload && payload.sql;
    const entry = connectionId ? drivers.get(connectionId) : drivers.values().next().value;
    if (!entry || !entry.driver) return { ok: false, error: 'no active connection' };
    try {
      const result = await entry.driver.runQuery({ sql, options: payload.options || {} });
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('db:listTables', async (_evt, payload) => {
    const connectionId = payload && payload.connectionId;
    const entry = connectionId ? drivers.get(connectionId) : drivers.values().next().value;
    if (!entry || !entry.driver) return { ok: false, error: 'no active connection' };
    try {
      const list = await entry.driver.listTables(payload || {});
      return { ok: true, data: list };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Additional handlers (listColumns, getTableDefinition, etc.) can be added here
}

module.exports = { registerDbHandlers, drivers };
