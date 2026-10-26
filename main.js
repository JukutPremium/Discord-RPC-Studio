const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, shell, net, safeStorage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Client } = require('@xhayper/discord-rpc');
const { locales, tags } = require('./locales');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const ICON = path.join(__dirname, 'assets', 'icon.png');
const DEFAULTS = {
  settings: { clientId: '', autoConnect: false, autoApply: true, openAtLogin: false, startHidden: false, imgbbKey: '', lang: '', rotation: { enabled: false, presets: [], interval: 30 } },
  presets: {},
  assets: [],
  last: null,
};

let win = null, tray = null, store = null, storePath = '';
let updater = null;
let rpc = null, status = 'disconnected', statusInfo = {};
let wantConnected = false, retryTimer = null, currentActivity = null;
let currentForm = null, timerBase = null, rotTimer = null, rotIdx = 0, cpuNow = 0;
app.isQuitting = false;

function curLang() {
  const l = store && store.settings.lang;
  if (l && locales[l]) return l;
  const sys = (app.getLocale() || 'en').slice(0, 2).toLowerCase();
  return locales[sys] ? sys : 'en';
}
function t(key, vars) {
  let s = locales[curLang()][key] ?? locales.en[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}
function loadStore() {
  storePath = path.join(app.getPath('userData'), 'rpc-studio.json');
  try {
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    store = { ...structuredClone(DEFAULTS), ...raw };
    store.settings = { ...DEFAULTS.settings, ...(raw.settings || {}) };
  } catch {
    store = structuredClone(DEFAULTS);
  }
}
function saveStore() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}
const pad = (s) => (s.length === 1 ? s + '\u200b' : s);
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || '');

function resolveImage(v) {
  v = (v || '').trim();
  if (!v) return undefined;
  const a = store.assets.find((x) => x.name === v);
  return a ? a.url : v;
}

function buildActivity(f, base) {
  const act = { type: Number(f.type) || 0 };
  const t = (k) => expand((f[k] || '').trim());

  if (t('details')) act.details = pad(t('details').slice(0, 128));
  if (t('state')) act.state = pad(t('state').slice(0, 128));
  if (isUrl(t('detailsUrl'))) act.detailsUrl = t('detailsUrl');
  if (isUrl(t('stateUrl'))) act.stateUrl = t('stateUrl');
  act.statusDisplayType = Number(f.statusDisplayType) || 0;

  const li = resolveImage(f.largeImage), si = resolveImage(f.smallImage);
  if (li) act.largeImageKey = li;
  if (li && t('largeText')) act.largeImageText = pad(t('largeText').slice(0, 128));
  if (isUrl(t('largeUrl'))) act.largeImageUrl = t('largeUrl');
  if (si) act.smallImageKey = si;
  if (si && t('smallText')) act.smallImageText = pad(t('smallText').slice(0, 128));
  if (isUrl(t('smallUrl'))) act.smallImageUrl = t('smallUrl');

  const now = base || Date.now();
  if (f.timeMode === 'elapsed') act.startTimestamp = new Date(now);
  else if (f.timeMode === 'custom' && t('customStart')) {
    const d = new Date(t('customStart'));
    if (!isNaN(d)) act.startTimestamp = d;
  } else if (f.timeMode === 'countdown') {
    const m = parseFloat(f.countdownMin);
    if (m > 0) act.endTimestamp = new Date(now + m * 60000);
  }

  const ps = parseInt(f.partySize, 10), pm = parseInt(f.partyMax, 10);
  if (ps > 0 && pm >= ps) { act.partySize = ps; act.partyMax = pm; }

  const buttons = [];
  for (const n of [1, 2]) {
    const label = t(`btn${n}Label`), url = t(`btn${n}Url`);
    if (label && isUrl(url)) buttons.push({ label: label.slice(0, 32), url });
  }
  if (buttons.length) act.buttons = buttons;
  return act;
}
function setStatus(s, info = {}) {
  status = s; statusInfo = info;
  if (win && !win.isDestroyed()) win.webContents.send('status', { status, ...info });
  updateTray();
}

async function teardown() {
  clearTimeout(retryTimer);
  if (rpc) {
    const r = rpc; rpc = null;
    r.removeAllListeners();
    try { await r.destroy(); } catch {}
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  if (!wantConnected) return;
  retryTimer = setTimeout(() => connect(store.settings.clientId), 5000);
}

async function pushActivity() {
  if (!rpc || status !== 'connected') return;
  if (currentActivity) await rpc.user.setActivity(currentActivity);
  else await rpc.user.clearActivity();
}

const p2 = (n) => String(n).padStart(2, '0');
const ramPct = () => Math.round(100 * (1 - os.freemem() / os.totalmem()));
const OS_NAME = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || process.platform;
const ALIAS = { jam: 'time', tanggal: 'date', hari: 'day', bulan: 'month', tahun: 'year', menit: 'minute' };
const TOKEN_RE = /\{(time|time12|date|day|month|year|hour|minute|cpu|ram|uptime|os|cores|tz|jam|tanggal|hari|bulan|tahun|menit)\}/gi;
let lastCpu = os.cpus();
setInterval(() => {
  const cur = os.cpus(); let idle = 0, total = 0;
  cur.forEach((c, i) => {
    const p = lastCpu[i]; if (!p) return;
    for (const k in c.times) total += c.times[k] - p.times[k];
    idle += c.times.idle - p.times.idle;
  });
  lastCpu = cur; cpuNow = total ? Math.round(100 * (1 - idle / total)) : 0;
}, 5000);
function fmtUptime(sec) {
  const m = Math.floor(sec / 60), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return `${d ? d + 'd ' : ''}${h}h ${m % 60}m`;
}
function expand(s) {
  if (!s || !s.includes('{')) return s;
  const d = new Date(), tag = tags[curLang()];
  const map = {
    time: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
    time12: d.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit', hour12: true }),
    date: d.toLocaleDateString(tag),
    day: d.toLocaleDateString(tag, { weekday: 'long' }),
    month: d.toLocaleDateString(tag, { month: 'long' }),
    year: String(d.getFullYear()),
    hour: p2(d.getHours()),
    minute: p2(d.getMinutes()),
    cpu: cpuNow + '%',
    ram: ramPct() + '%',
    uptime: fmtUptime(os.uptime()),
    os: OS_NAME,
    cores: String(os.cpus().length),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return s.replace(TOKEN_RE, (_, k) => { k = k.toLowerCase(); return map[ALIAS[k] || k]; });
}
const toWin = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };

function applyForm(form, reset = true) {
  currentForm = form;
  if (reset || !timerBase) timerBase = Date.now();
  currentActivity = buildActivity(form, timerBase);
}
setInterval(() => {
  if (!currentForm || status !== 'connected' || !JSON.stringify(currentForm).includes('{')) return;
  currentActivity = buildActivity(currentForm, timerBase);
  pushActivity().catch(() => {});
}, 30000);
function rotateNext() {
  const r = store.settings.rotation;
  const names = (r.presets || []).filter((n) => store.presets[n]);
  if (!names.length) return;
  const name = names[rotIdx % names.length]; rotIdx++;
  applyForm(store.presets[name], false);
  pushActivity().catch(() => {});
  toWin('rotation', { name });
}
function startRotation() {
  clearInterval(rotTimer); rotTimer = null;
  const r = store.settings.rotation;
  if (!r || !r.enabled || !(r.presets || []).some((n) => store.presets[n])) { toWin('rotation', { name: '' }); updateTray(); return; }
  rotIdx = 0; rotateNext();
  rotTimer = setInterval(rotateNext, Math.max(15, Number(r.interval) || 30) * 1000);
  updateTray();
}
function applyPresetByName(name) {
  const d = store.presets[name]; if (!d) return;
  if (store.settings.rotation?.enabled) {
    store.settings.rotation.enabled = false; saveStore(); startRotation();
    toWin('settings', { rotation: store.settings.rotation });
  }
  applyForm(d, true); store.last = d; saveStore();
  pushActivity().catch(() => {});
  toWin('preset-applied', { name, data: d });
  updateTray();
}
function toggleRotation() {
  const r = store.settings.rotation; r.enabled = !r.enabled; saveStore(); startRotation();
  toWin('settings', { rotation: r });
}

async function connect(clientId) {
  wantConnected = true;
  await teardown();
  const client = new Client({ clientId });
  rpc = client;
  client.on('ready', async () => {
    if (rpc !== client) return;
    setStatus('connected', { user: client.user?.username || '' });
    try { await pushActivity(); } catch (e) { setStatus('connected', { user: client.user?.username || '', message: e.message }); }
  });
  client.on('disconnected', () => {
    if (rpc !== client) return;
    setStatus('disconnected', { message: t('msg.dropped') });
    teardown().then(scheduleRetry);
  });
  setStatus('connecting');
  try { await client.login(); }
  catch (e) {
    if (rpc !== client) return;
    setStatus('error', { message: t('msg.noDiscord') });
    await teardown();
    scheduleRetry();
  }
}

async function disconnect() {
  wantConnected = false;
  await teardown();
  setStatus('disconnected');
}
function showWindow() {
  if (!win) return createWindow(false);
  win.show(); win.focus();
  if (process.platform === 'darwin') app.dock?.show();
}

function createWindow(hidden) {
  win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 900, minHeight: 600,
    show: !hidden, backgroundColor: '#1e1f22', title: 'RPC Studio', icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (isUrl(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
      if (process.platform === 'darwin') app.dock?.hide();
    }
  });
  win.on('closed', () => { win = null; });
  if (app.isPackaged) win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
}

function updateTray() {
  if (!tray) return;
  const label = t('status.' + status);
  const connected = status === 'connected' || status === 'connecting' || (wantConnected && status !== 'disconnected');
  tray.setToolTip(`RPC Studio — ${label}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('tray.open'), click: showWindow },
    { type: 'separator' },
    { label: t('tray.status', { s: label }), enabled: false },
    connected
      ? { label: t('tray.disconnect'), click: disconnect }
      : { label: t('tray.connect'), enabled: !!store.settings.clientId, click: () => connect(store.settings.clientId) },
    { label: t('tray.update'), click: () => { showWindow(); updater && updater.check(true); } },
    { label: t('tray.preset'), submenu: Object.keys(store.presets).length
        ? Object.keys(store.presets).map((n) => ({ label: n, click: () => applyPresetByName(n) }))
        : [{ label: t('tray.noPreset'), enabled: false }] },
    { label: store.settings.rotation?.enabled ? t('tray.rotOff') : t('tray.rotOn'),
      enabled: (store.settings.rotation?.presets || []).some((n) => store.presets[n]), click: toggleRotation },
    { label: t('tray.clear'), enabled: status === 'connected', click: async () => { currentActivity = null; try { await pushActivity(); } catch {} } },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  let img = nativeImage.createFromPath(ICON);
  img = img.resize({ width: process.platform === 'darwin' ? 18 : 24, height: process.platform === 'darwin' ? 18 : 24 });
  tray = new Tray(img);
  tray.on('click', () => (win && win.isVisible() ? win.hide() : showWindow()));
  updateTray();
}
const clean = (s) => String(s || '').replace(/[^\w\- ]+/g, '').trim().slice(0, 40);

ipcMain.handle('store:get', () => ({
  ...store,
  settings: { ...store.settings, botTokenEnc: undefined, hasBotToken: !!store.settings.botTokenEnc },
  status: { status, ...statusInfo },
}));
function getBotToken() {
  const v = store.settings.botTokenEnc || '';
  try {
    if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
    if (v.startsWith('plain:')) return v.slice(6);
  } catch {}
  return '';
}
ipcMain.handle('token:set', (_, token) => {
  token = (token || '').trim();
  if (!token) { store.settings.botTokenEnc = ''; saveStore(); return { ok: true, has: false }; }
  store.settings.botTokenEnc = safeStorage.isEncryptionAvailable()
    ? 'enc:' + safeStorage.encryptString(token).toString('base64')
    : 'plain:' + token;
  saveStore();
  return { ok: true, has: true };
});
ipcMain.handle('appicon:set', async () => {
  const token = getBotToken();
  if (!token) return { ok: false, message: t('msg.needToken') };
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: t('dlg.images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (r.canceled) return { ok: false };
  try {
    let img = nativeImage.createFromPath(r.filePaths[0]);
    if (img.isEmpty()) return { ok: false, message: t('msg.imgUnreadable') };
    const { width, height } = img.getSize(), s = Math.min(width, height);
    img = img.crop({ x: Math.floor((width - s) / 2), y: Math.floor((height - s) / 2), width: s, height: s }).resize({ width: 512, height: 512 });
    const res = await net.fetch('https://discord.com/api/v10/applications/@me', {
      method: 'PATCH',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://localhost, 1.0)' },
      body: JSON.stringify({ icon: 'data:image/png;base64,' + img.toPNG().toString('base64') }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.message || msg; } catch {}
      return { ok: false, message: res.status === 401 ? t('msg.badToken') : t('msg.failed', { e: msg }) };
    }
    return { ok: true };
  } catch (e) { return { ok: false, message: t('msg.failed', { e: e.cause?.code || e.message }) }; }
});

ipcMain.handle('i18n:get', () => {
  const lang = curLang();
  return {
    lang,
    tag: tags[lang],
    dict: { ...locales.en, ...locales[lang] },
    langs: Object.keys(locales).map((code) => ({ code, name: locales[code]['lang.name'] })),
  };
});

ipcMain.handle('settings:set', (_, patch) => {
  if ('lang' in patch && !locales[patch.lang]) patch.lang = '';
  store.settings = { ...store.settings, ...patch };
  if ('openAtLogin' in patch) {
    try { app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin, args: ['--hidden'] }); } catch {}
  }
  if (store.settings.rotation) store.settings.rotation.interval = Math.max(15, Number(store.settings.rotation.interval) || 30);
  saveStore(); updateTray();
  if ('rotation' in patch) startRotation();
  if ('lang' in patch && currentForm) {
    currentActivity = buildActivity(currentForm, timerBase);
    pushActivity().catch(() => {});
  }
  return { ...store.settings, botTokenEnc: undefined, hasBotToken: !!store.settings.botTokenEnc };
});

ipcMain.handle('last:save', (_, data) => { store.last = data; saveStore(); });

ipcMain.handle('rpc:connect', async (_, clientId) => {
  if (!/^\d{17,20}$/.test(clientId || '')) return { ok: false, message: t('msg.badClientId') };
  store.settings.clientId = clientId; saveStore();
  connect(clientId);
  return { ok: true };
});
ipcMain.handle('rpc:disconnect', () => disconnect());

ipcMain.handle('rpc:apply', async (_, form) => {
  applyForm(form, true);
  store.last = form; saveStore();
  if (status !== 'connected') return { ok: false, message: t('msg.notConnected') };
  try { await pushActivity(); return { ok: true }; }
  catch (e) { return { ok: false, message: t('msg.failed', { e: e.message }) }; }
});
ipcMain.handle('rpc:clear', async () => {
  currentActivity = null; currentForm = null;
  try { await pushActivity(); return { ok: true }; } catch (e) { return { ok: false, message: e.message }; }
});
ipcMain.handle('preset:save', (_, name, data) => {
  name = clean(name);
  if (!name) return { ok: false, message: t('msg.badPresetName') };
  store.presets[name] = data; saveStore(); updateTray();
  return { ok: true, presets: store.presets };
});
ipcMain.handle('preset:delete', (_, name) => {
  delete store.presets[name];
  const r = store.settings.rotation; if (r) r.presets = (r.presets || []).filter((x) => x !== name);
  saveStore(); updateTray(); if (r?.enabled) startRotation();
  return store.presets;
});
ipcMain.handle('preset:export', async (_, name) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: `${name}.rpcpreset.json`, filters: [{ name: t('dlg.preset'), extensions: ['json'] }] });
  if (r.canceled) return { ok: false };
  fs.writeFileSync(r.filePath, JSON.stringify({ name, data: store.presets[name] }, null, 2));
  return { ok: true };
});
ipcMain.handle('preset:import', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: t('dlg.preset'), extensions: ['json'] }] });
  if (r.canceled) return { ok: false };
  try {
    const j = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    const name = clean(j.name || path.basename(r.filePaths[0]).replace(/\..*$/, '')) || 'import';
    store.presets[name] = j.data || j; saveStore(); updateTray();
    return { ok: true, presets: store.presets, name };
  } catch { return { ok: false, message: t('msg.badPresetFile') }; }
});
async function send(url, fd) {
  const r = await net.fetch(url, { method: 'POST', body: fd, headers: { 'User-Agent': 'RPC-Studio/1.0' }, signal: AbortSignal.timeout(40000) });
  const t = (await r.text()).trim();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 80)}`);
  return t;
}
async function uploadImage(buf, name) {
  const errs = [], hosts = [];
  const key = (store.settings.imgbbKey || '').trim();
  if (key) hosts.push(['ImgBB', async () => {
    const fd = new FormData(); fd.append('image', buf.toString('base64'));
    const j = JSON.parse(await send(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, fd));
    if (!j.success) throw new Error(t('msg.rejected', { h: 'ImgBB' }));
    return j.data.url;
  }]);
  hosts.push(['Catbox', async () => {
    const fd = new FormData(); fd.append('reqtype', 'fileupload'); fd.append('fileToUpload', new Blob([buf]), name);
    return send('https://catbox.moe/user/api.php', fd);
  }]);
  hosts.push(['0x0.st', async () => {
    const fd = new FormData(); fd.append('file', new Blob([buf]), name);
    return send('https://0x0.st', fd);
  }]);
  for (const [label, fn] of hosts) {
    try { const u = await fn(); if (isUrl(u)) return u; throw new Error(t('msg.badResponse')); }
    catch (e) { errs.push(`${label}: ${e.cause?.code || e.message}`); }
  }
  throw new Error(errs.join(' | '));
}
function uniqueName(base) {
  let n = clean(base) || 'asset', i = 2, out = n;
  while (store.assets.some((a) => a.name === out)) out = `${n}${i++}`;
  return out;
}
ipcMain.handle('asset:pickLocal', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: t('dlg.images'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  });
  if (r.canceled) return { ok: false };
  const file = r.filePaths[0];
  if (fs.statSync(file).size > 10 * 1024 * 1024) return { ok: false, message: t('msg.maxSize') };
  try {
    let buf = fs.readFileSync(file), upName = path.basename(file);
    if (!/\.gif$/i.test(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) {
        const { width, height } = img.getSize();
        const out = Math.max(width, height) > 512 ? img.resize(width >= height ? { width: 512 } : { height: 512 }) : img;
        buf = out.toPNG();
        upName = path.basename(file, path.extname(file)) + '.png';
      }
    }
    const url = await uploadImage(buf, upName);
    store.assets.push({ name: uniqueName(path.basename(file, path.extname(file))), url, fileUrl: pathToFileURL(file).href, source: 'local' });
    saveStore();
    return { ok: true, assets: store.assets };
  } catch (e) { return { ok: false, message: t('msg.uploadFailed', { e: e.message }) }; }
});
ipcMain.handle('asset:add', (_, name, url) => {
  name = clean(name); url = (url || '').trim();
  if (!name || !url) return { ok: false, message: t('msg.fillNameUrl') };
  store.assets = store.assets.filter((a) => a.name !== name);
  store.assets.push({ name, url, source: isUrl(url) ? 'url' : 'key' }); saveStore();
  return { ok: true, assets: store.assets };
});
ipcMain.handle('asset:remove', (_, name) => { store.assets = store.assets.filter((a) => a.name !== name); saveStore(); return store.assets; });

ipcMain.handle('sys:stats', () => ({ cpu: cpuNow, ram: ramPct(), uptime: os.uptime(), os: OS_NAME, cores: os.cpus().length }));

ipcMain.handle('open:external', (_, url) => { if (isUrl(url)) shell.openExternal(url); });
app.on('second-instance', showWindow);
app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', (e) => { if (!app.isQuitting) e.preventDefault(); });
app.on('activate', showWindow);

app.whenReady().then(() => {
  loadStore();
  const hidden = process.argv.includes('--hidden') || store.settings.startHidden;
  createWindow(hidden);
  createTray();
  updater = require('./updater').init({ toWin, setQuitting: () => { app.isQuitting = true; } });
  if (store.settings.autoConnect && /^\d{17,20}$/.test(store.settings.clientId)) {
    if (store.settings.autoApply && store.last) applyForm(store.last, true);
    connect(store.settings.clientId);
  }
  startRotation();
});
