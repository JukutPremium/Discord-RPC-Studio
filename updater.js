const { app, ipcMain, shell } = require('electron');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}

const HOUR = 3600 * 1000;

function cleanNotes(n) {
  if (!n) return '';
  const raw = Array.isArray(n) ? n.map((x) => x.note || '').join('\n\n') : String(n);
  return raw
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/ul|\/ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function init({ toWin, setQuitting }) {
  const pkg = require('./package.json');
  const state = { state: 'idle', current: app.getVersion(), version: '', notes: '', percent: 0, speed: 0, message: '', manual: false, canManual: !!pkg.releasesUrl };

  const push = (patch) => {
    Object.assign(state, patch);
    toWin('update', { ...state });
  };

  const enabled = !!autoUpdater && app.isPackaged;

  if (enabled) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => push({ state: 'checking', message: '' }));
    autoUpdater.on('update-available', (info) => push({
      state: 'available', version: info.version, notes: cleanNotes(info.releaseNotes), percent: 0, message: '',
    }));
    autoUpdater.on('update-not-available', () => push({ state: 'latest', message: '' }));
    autoUpdater.on('download-progress', (p) => push({ state: 'downloading', percent: Math.round(p.percent || 0), speed: p.bytesPerSecond || 0 }));
    autoUpdater.on('update-downloaded', (info) => push({ state: 'ready', version: info.version, percent: 100 }));
    autoUpdater.on('error', (e) => push({ state: 'error', message: String((e && e.message) || e).split('\n')[0].slice(0, 200) }));
  }

  async function check(manual = false) {
    state.manual = manual;
    if (!enabled) { push({ state: 'dev', manual }); return; }
    if (['downloading', 'ready'].includes(state.state)) { push({ manual }); return; }
    try { await autoUpdater.checkForUpdates(); } catch (e) { push({ state: 'error', message: String((e && e.message) || e).split('\n')[0].slice(0, 200) }); }
  }

  ipcMain.handle('update:state', () => ({ ...state }));
  ipcMain.handle('update:check', () => check(true));
  ipcMain.handle('update:download', async () => {
    if (!enabled || state.state !== 'available') return;
    push({ state: 'downloading', percent: 0, speed: 0 });
    try { await autoUpdater.downloadUpdate(); } catch (e) { push({ state: 'error', message: String((e && e.message) || e).split('\n')[0].slice(0, 200) }); }
  });
  ipcMain.handle('update:install', () => {
    if (!enabled || state.state !== 'ready') return;
    setQuitting();
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
  ipcMain.handle('update:manual', () => { if (pkg.releasesUrl) shell.openExternal(pkg.releasesUrl); });

  if (enabled) {
    setTimeout(() => check(false), 8000);
    setInterval(() => check(false), 4 * HOUR);
  }

  return { check };
}

module.exports = { init };
