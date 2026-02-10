function registerElectronHandlers(ipcMain, opts = {}) {
  // opts may include { getMainWindow: () => BrowserWindow, shell, dialog, nativeTheme }
  const getMainWindow = opts.getMainWindow || (() => null);
  const shell = opts.shell;
  const dialog = opts.dialog;
  const nativeTheme = opts.nativeTheme;

  ipcMain.handle('app:setProgressBar', async (_evt, value) => {
    const win = getMainWindow();
    if (!win || typeof win.setProgressBar !== 'function') return { ok: false, error: 'no window' };
    try {
      win.setProgressBar(Number(value) || 0);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('app:openExternal', async (_evt, url) => {
    if (!shell || typeof shell.openExternal !== 'function') return { ok: false, error: 'shell not provided' };
    try {
      await shell.openExternal(String(url));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('dialog:error', async (_evt, message) => {
    if (!dialog || typeof dialog.showErrorBox !== 'function') return { ok: false, error: 'dialog not provided' };
    try {
      dialog.showErrorBox('Error', String(message || ''));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('system:getNativeTheme', async () => {
    if (!nativeTheme) return { ok: false, error: 'nativeTheme not provided' };
    try {
      return { ok: true, data: { shouldUseDarkColors: !!nativeTheme.shouldUseDarkColors } };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // To emit theme updates, main process can call: mainWindow.webContents.send('system:theme-updated', payload)
}

module.exports = { registerElectronHandlers };
