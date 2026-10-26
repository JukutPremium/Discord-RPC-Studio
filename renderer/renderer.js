const $ = (id) => document.getElementById(id);
const FIELDS = ['type','statusDisplayType','details','detailsUrl','state','stateUrl',
  'largeImage','largeText','largeUrl','smallImage','smallText','smallUrl',
  'timeMode','customStart','countdownMin','partySize','partyMax',
  'btn1Label','btn1Url','btn2Label','btn2Url'];
const TEXT_FIELDS = ['details','state','largeText','smallText','btn1Label','btn2Label'];
const TOKENS = ['time','time12','date','day','month','year','hour','minute','cpu','ram','uptime','os','cores','tz'];
const ALIAS = { jam: 'time', tanggal: 'date', hari: 'day', bulan: 'month', tahun: 'year', menit: 'minute' };
const TOKEN_RE = /\{(time|time12|date|day|month|year|hour|minute|cpu|ram|uptime|os|cores|tz|jam|tanggal|hari|bulan|tahun|menit)\}/gi;

let S = { settings: {}, presets: {}, assets: [] };
let I = { lang: 'en', tag: 'en-US', dict: {}, langs: [] };
let stats = { cpu: 0, ram: 0, uptime: 0, os: '', cores: 0 };
let timerRef = Date.now();
let U = { state: 'idle', current: '', version: '', notes: '', percent: 0, speed: 0, message: '', canManual: false };
let modalOpen = false;
let saveT, lastText = 'details', lastStatus = { status: 'disconnected' }, rotName = '', connActive = false;

const t = (k, v) => {
  let s = I.dict[k] ?? k;
  if (v) for (const x in v) s = s.split(`{${x}}`).join(v[x]);
  return s;
};

function applyI18n() {
  document.documentElement.lang = I.lang;
  document.querySelectorAll('[data-i18n]').forEach((e) => {
    e.textContent = t(e.dataset.i18n, e.dataset.n ? { n: e.dataset.n } : undefined);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
  $('pvApp').textContent = t('pv.app');
  const sel = $('lang'); sel.innerHTML = '';
  I.langs.forEach((l) => {
    const o = document.createElement('option'); o.value = l.code; o.textContent = l.name; sel.appendChild(o);
  });
  sel.value = I.lang;
  updateTokenPlaceholder();
}

function updateTokenPlaceholder() {
  $('botToken').placeholder = S.settings.hasBotToken ? t('ph.botTokenSaved') : t('ph.botToken');
}

const readForm = () => Object.fromEntries(FIELDS.map((f) => [f, $(f).value]));
function writeForm(d) {
  if (!d) return;
  FIELDS.forEach((f) => { if (d[f] !== undefined) $(f).value = d[f]; });
  timerRef = Date.now();
  refresh();
}
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), Math.max(3200, msg.length * 60));
}
function flashPreview() {
  const rp = $('rp'); rp.classList.remove('flash'); void rp.offsetWidth; rp.classList.add('flash');
}

const p2 = (n) => String(n).padStart(2, '0');
function fmtUptime(sec) {
  const m = Math.floor(sec / 60), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return `${d ? d + 'd ' : ''}${h}h ${m % 60}m`;
}
function expand(s) {
  if (!s || !s.includes('{')) return s;
  const d = new Date(), tag = I.tag;
  const map = {
    time: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
    time12: d.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit', hour12: true }),
    date: d.toLocaleDateString(tag),
    day: d.toLocaleDateString(tag, { weekday: 'long' }),
    month: d.toLocaleDateString(tag, { month: 'long' }),
    year: String(d.getFullYear()),
    hour: p2(d.getHours()),
    minute: p2(d.getMinutes()),
    cpu: stats.cpu + '%',
    ram: stats.ram + '%',
    uptime: fmtUptime(stats.uptime || 0),
    os: stats.os || '',
    cores: String(stats.cores || ''),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return s.replace(TOKEN_RE, (_, k) => { k = k.toLowerCase(); return map[ALIAS[k] || k]; });
}
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || '');
function imgSrc(v) {
  v = (v || '').trim();
  const a = S.assets.find((x) => x.name === v);
  if (a) return a.fileUrl || (isUrl(a.url) ? a.url : '');
  return isUrl(v) ? v : '';
}
const fmt = (ms) => {
  ms = Math.max(0, ms); const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${p2(m)}:${p2(x)}` : `${p2(m)}:${p2(x)}`;
};

function tick() {
  const f = readForm(); let txt = '';
  if (f.timeMode === 'elapsed') txt = t('pv.elapsed', { t: fmt(Date.now() - timerRef) });
  else if (f.timeMode === 'custom' && f.customStart) {
    const d = new Date(f.customStart);
    if (!isNaN(d)) txt = t('pv.elapsed', { t: fmt(Date.now() - d) });
  } else if (f.timeMode === 'countdown') {
    const m = parseFloat(f.countdownMin);
    if (m > 0) txt = t('pv.left', { t: fmt(m * 60000 - (Date.now() - timerRef)) });
  }
  $('pvTime').textContent = txt;
}

function setPreview(id, value) {
  const el = $(id);
  if (el.textContent === value) return;
  el.textContent = value;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'fadeIn .35s ease both';
}

function refresh() {
  const f = readForm();
  $('customWrap').classList.toggle('hide', f.timeMode !== 'custom');
  $('countWrap').classList.toggle('hide', f.timeMode !== 'countdown');
  $('pvHead').textContent = t('pv.h' + (HEAD_KEYS.includes(f.type) ? f.type : '0'));
  setPreview('pvDetails', expand(f.details));
  setPreview('pvState', expand(f.state));
  const ps = parseInt(f.partySize, 10), pm = parseInt(f.partyMax, 10);
  $('pvParty').textContent = ps > 0 && pm >= ps ? t('pv.party', { a: ps, b: pm }) : '';
  const L = imgSrc(f.largeImage), Sm = imgSrc(f.smallImage);
  if ($('pvLarge').getAttribute('src') !== L) $('pvLarge').src = L;
  if ($('pvSmall').getAttribute('src') !== Sm) $('pvSmall').src = Sm;
  $('pvLarge').style.visibility = L ? 'visible' : 'hidden';
  $('pvSmall').style.visibility = Sm ? 'visible' : 'hidden';
  const btns = [1, 2].filter((n) => f[`btn${n}Label`].trim() && isUrl(f[`btn${n}Url`])).map((n) => expand(f[`btn${n}Label`]));
  const box = $('pvBtns');
  const current = [...box.children].map((c) => c.textContent);
  if (current.join('\u0000') !== btns.join('\u0000')) {
    box.innerHTML = '';
    btns.forEach((label) => { const d = document.createElement('div'); d.textContent = label; box.appendChild(d); });
  }
  tick();
}
const HEAD_KEYS = ['0', '2', '3', '5'];

function onChange() {
  refresh();
  clearTimeout(saveT);
  saveT = setTimeout(() => window.api.saveLast(readForm()), 500);
}

function renderChips() {
  const box = $('chips'); box.innerHTML = '';
  TOKENS.forEach((k, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = `{${k}}`;
    b.style.animationDelay = `${i * 25}ms`;
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => insertToken(k);
    box.appendChild(b);
  });
  updateChipTitles();
}
function updateChipTitles() {
  [...$('chips').children].forEach((b, i) => { b.title = expand(`{${TOKENS[i]}}`); });
}
function insertToken(k) {
  const el = $(lastText); el.focus();
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
  el.setRangeText(`{${k}}`, s, e, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function mkBtn(li, text, fn, cls) {
  const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.onclick = fn; li.appendChild(b);
}

function renderAssets() {
  const ul = $('assetList'); ul.innerHTML = '';
  S.assets.forEach((a, i) => {
    const li = document.createElement('li'); li.style.animationDelay = `${i * 40}ms`;
    const im = document.createElement('img'); im.src = a.fileUrl || (isUrl(a.url) ? a.url : ''); li.appendChild(im);
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = a.name; nm.title = a.url;
    const sub = document.createElement('small'); sub.className = 'muted'; sub.style.display = 'block'; sub.textContent = a.url; nm.appendChild(sub); li.appendChild(nm);
    if (isUrl(a.url)) {
      mkBtn(li, t('as.test'), () => window.api.openExternal(a.url));
      mkBtn(li, t('as.copy'), () => { navigator.clipboard.writeText(a.url); toast(t('t.urlCopied')); });
    }
    mkBtn(li, t('as.large'), () => { $('largeImage').value = a.name; onChange(); });
    mkBtn(li, t('as.small'), () => { $('smallImage').value = a.name; onChange(); });
    mkBtn(li, '✕', async () => { S.assets = await window.api.removeAsset(a.name); renderAssets(); refresh(); }, 'danger');
    ul.appendChild(li);
  });
  ['largePick', 'smallPick'].forEach((id) => {
    const sel = $(id); sel.innerHTML = '';
    const first = document.createElement('option'); first.value = ''; first.textContent = t('img.library'); sel.appendChild(first);
    S.assets.forEach((a) => { const o = document.createElement('option'); o.value = a.name; o.textContent = a.name; sel.appendChild(o); });
  });
}

function renderPresets() {
  const ul = $('presetList'); ul.innerHTML = '';
  const names = Object.keys(S.presets);
  renderRotation();
  if (!names.length) {
    const li = document.createElement('li'); li.className = 'muted'; li.textContent = t('pre.empty'); ul.appendChild(li);
    return;
  }
  names.forEach((n, i) => {
    const li = document.createElement('li'); li.style.animationDelay = `${i * 40}ms`;
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = n; li.appendChild(nm);
    mkBtn(li, t('pre.load'), () => { writeForm(S.presets[n]); window.api.saveLast(readForm()); toast(t('t.presetLoaded', { name: n })); });
    mkBtn(li, t('pre.loadApply'), async () => {
      writeForm(S.presets[n]);
      const r = await window.api.apply(readForm());
      if (r.ok) flashPreview();
      toast(r.ok ? t('t.presetApplied', { name: n }) : r.message);
    });
    mkBtn(li, t('pre.export'), () => window.api.exportPreset(n));
    mkBtn(li, '✕', async () => {
      S.presets = await window.api.deletePreset(n);
      if (S.settings.rotation) S.settings.rotation.presets = (S.settings.rotation.presets || []).filter((x) => x !== n);
      renderPresets();
    }, 'danger');
    ul.appendChild(li);
  });
}

function renderRotation() {
  const rot = S.settings.rotation = S.settings.rotation || { enabled: false, presets: [], interval: 30 };
  $('rotEnabled').checked = !!rot.enabled;
  $('rotInterval').value = rot.interval || 30;
  const box = $('rotList'); box.innerHTML = '';
  const names = Object.keys(S.presets);
  if (!names.length) {
    const s = document.createElement('span'); s.className = 'muted'; s.textContent = t('rot.needPreset'); box.appendChild(s);
    return;
  }
  names.forEach((n) => {
    const l = document.createElement('label'); l.className = 'chk';
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = (rot.presets || []).includes(n); c.dataset.name = n;
    c.onchange = saveRotation;
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + n)); box.appendChild(l);
  });
}
function updateRotStatus() {
  $('rotStatus').textContent = rotName ? t('rot.on', { name: rotName }) : t('rot.off');
}
async function saveRotation() {
  const presets = [...$('rotList').querySelectorAll('input:checked')].map((i) => i.dataset.name);
  const rot = { enabled: $('rotEnabled').checked, presets, interval: Math.max(15, parseInt($('rotInterval').value, 10) || 30) };
  if (rot.enabled && !presets.length) { rot.enabled = false; $('rotEnabled').checked = false; toast(t('rot.min')); }
  S.settings = await window.api.setSettings({ rotation: rot });
}

function setStatus(s) {
  lastStatus = s;
  $('dot').className = 'dot ' + s.status;
  $('statusText').textContent = t('status.' + s.status) + (s.status === 'connected' && s.user ? ` (${s.user})` : '');
  connActive = s.status === 'connected' || s.status === 'connecting' || s.status === 'error';
  $('connectBtn').textContent = connActive ? t('btn.disconnect') : t('btn.connect');
  $('connectBtn').className = connActive ? 'danger' : 'primary';
  if (s.message && s.status !== 'connected') toast(s.message);
}

const fmtSpeed = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

function openModal() { modalOpen = true; $('modal').classList.add('open'); renderModal(); }
function closeModal() { modalOpen = false; $('modal').classList.remove('open'); }

function renderUpdateBar() {
  $('ver').textContent = U.current ? t('up.version', { v: 'v' + U.current }) : '';
  const btn = $('upBtn');
  const show = ['available', 'downloading', 'ready'].includes(U.state);
  btn.classList.toggle('hide', !show);
  btn.textContent = U.state === 'downloading' ? `${t('up.btn')} ${U.percent}%` : U.state === 'ready' ? t('up.restart') : t('up.btn');
  $('upCheck').disabled = U.state === 'checking' || U.state === 'downloading';
  $('upCheckInfo').textContent = U.state === 'checking' ? t('up.checking') : '';
}

function renderModal() {
  if (!modalOpen) return;
  const s = U.state;
  const icon = $('upIcon'), action = $('upAction'), later = $('upLater');
  icon.className = 'modal-icon' + (s === 'latest' ? ' ok' : s === 'error' ? ' err' : '');
  icon.textContent = s === 'latest' ? '✓' : s === 'error' ? '!' : s === 'ready' ? '✓' : '⬆';
  const showNotes = s === 'available' && !!U.notes;
  $('upNotesWrap').style.display = showNotes ? '' : 'none';
  $('upNotes').textContent = U.notes || '';
  const prog = s === 'downloading' || s === 'ready';
  $('upProg').style.display = prog ? '' : 'none';
  $('upProgText').style.display = prog ? '' : 'none';
  $('upBar').style.width = (s === 'ready' ? 100 : U.percent) + '%';
  later.style.display = '';
  later.disabled = false;
  action.disabled = false;
  action.style.display = '';
  action.onclick = null;
  later.textContent = t('up.later');
  later.onclick = closeModal;

  if (s === 'available') {
    $('upTitle').textContent = t('up.title');
    $('upSub').textContent = t('up.sub', { v: 'v' + U.version, c: 'v' + U.current });
    $('upProgText').textContent = '';
    action.textContent = t('up.now');
    action.onclick = () => window.api.downloadUpdate();
  } else if (s === 'downloading') {
    $('upTitle').textContent = t('up.downloading');
    $('upSub').textContent = t('up.version', { v: 'v' + U.version });
    $('upProgText').textContent = `${U.percent}%` + (U.speed ? ` • ${t('up.speed', { s: fmtSpeed(U.speed) })}` : '');
    action.textContent = `${U.percent}%`;
    action.disabled = true;
  } else if (s === 'ready') {
    $('upTitle').textContent = t('up.readyTitle');
    $('upSub').textContent = t('up.readySub', { v: 'v' + U.version });
    $('upProgText').textContent = '100%';
    action.textContent = t('up.install');
    action.onclick = () => { action.disabled = true; later.disabled = true; window.api.installUpdate(); };
  } else if (s === 'latest') {
    $('upTitle').textContent = t('up.latestTitle');
    $('upSub').textContent = t('up.latestSub', { c: 'v' + U.current });
    later.style.display = 'none';
    action.textContent = t('up.close');
    action.onclick = closeModal;
  } else if (s === 'error') {
    $('upTitle').textContent = t('up.errorTitle');
    $('upSub').textContent = U.message || '';
    later.textContent = t('up.close');
    if (U.canManual) { action.textContent = t('up.manual'); action.onclick = () => window.api.openReleases(); }
    else action.style.display = 'none';
  } else {
    closeModal();
  }
}

function onUpdate(d) {
  const prev = U.state;
  U = d;
  renderUpdateBar();
  if (d.manual && prev === 'checking' && ['available', 'ready', 'latest', 'error'].includes(d.state)) openModal();
  else if (d.manual && d.state === 'dev') toast(t('up.dev'));
  else renderModal();
}

function rerenderAll() {
  renderUpdateBar();
  renderModal();
  applyI18n();
  renderChips();
  renderAssets();
  renderPresets();
  updateRotStatus();
  setStatus({ ...lastStatus, message: '' });
  refresh();
}

(async function init() {
  I = await window.api.getI18n();
  S = await window.api.getStore();
  U = await window.api.getUpdate();
  $('clientId').value = S.settings.clientId || '';
  ['autoConnect', 'autoApply', 'openAtLogin', 'startHidden'].forEach((k) => {
    $(k).checked = !!S.settings[k];
    $(k).onchange = () => window.api.setSettings({ [k]: $(k).checked });
  });
  $('tokenSave').onclick = async () => {
    const r = await window.api.setBotToken($('botToken').value);
    S.settings.hasBotToken = r.has;
    $('botToken').value = ''; updateTokenPlaceholder();
    toast(r.has ? t('t.tokenSaved') : t('t.tokenRemoved'));
  };
  $('iconSet').onclick = async () => {
    toast(t('t.sending'));
    const r = await window.api.setAppIcon();
    if (r.ok) toast(t('t.iconChanged')); else if (r.message) toast(r.message);
  };
  $('imgbbKey').value = S.settings.imgbbKey || '';
  $('imgbbKey').onchange = () => window.api.setSettings({ imgbbKey: $('imgbbKey').value.trim() });
  $('assetPortal').onclick = () => {
    const id = $('clientId').value.trim();
    window.api.openExternal(/^\d{17,20}$/.test(id) ? `https://discord.com/developers/applications/${id}/rich-presence/assets` : 'https://discord.com/developers/applications');
  };
  $('lang').onchange = async (e) => {
    await window.api.setSettings({ lang: e.target.value });
    I = await window.api.getI18n();
    rerenderAll();
  };

  if (S.last) writeForm(S.last);
  lastStatus = S.status || { status: 'disconnected' };
  rerenderAll();
  window.api.onStatus(setStatus);
  window.api.onUpdate(onUpdate);
  $('upBtn').onclick = openModal;
  $('upCheck').onclick = () => window.api.checkUpdate();
  $('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal') && U.state !== 'downloading') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOpen && U.state !== 'downloading') closeModal(); });
  window.api.onRotation((d) => { rotName = d.name || ''; updateRotStatus(); });
  window.api.onSettings((d) => { if (d.rotation) { S.settings.rotation = d.rotation; renderRotation(); } });
  window.api.onPresetApplied((d) => { writeForm(d.data); flashPreview(); toast(t('t.fromTray', { name: d.name })); });
  $('rotEnabled').onchange = saveRotation;
  $('rotInterval').onchange = saveRotation;
  const poll = async () => { try { stats = await window.api.getStats(); refresh(); updateChipTitles(); } catch {} };
  poll(); setInterval(poll, 5000);
  setInterval(tick, 1000);
  setInterval(updateChipTitles, 30000);

  FIELDS.forEach((f) => { $(f).addEventListener('input', onChange); $(f).addEventListener('change', onChange); });
  TEXT_FIELDS.forEach((f) => $(f).addEventListener('focus', () => { lastText = f; }));
  $('largePick').onchange = (e) => { if (e.target.value) { $('largeImage').value = e.target.value; onChange(); } e.target.value = ''; };
  $('smallPick').onchange = (e) => { if (e.target.value) { $('smallImage').value = e.target.value; onChange(); } e.target.value = ''; };

  $('connectBtn').onclick = async () => {
    if (connActive) return window.api.disconnect();
    const r = await window.api.connect($('clientId').value.trim());
    if (!r.ok) toast(r.message);
  };
  $('applyBtn').onclick = async () => {
    timerRef = Date.now();
    const r = await window.api.apply(readForm());
    if (r.ok) flashPreview();
    toast(r.ok ? t('t.applied') : r.message);
  };
  $('clearBtn').onclick = async () => { const r = await window.api.clear(); toast(r.ok ? t('t.cleared') : r.message); };

  $('presetSave').onclick = async () => {
    const r = await window.api.savePreset($('presetName').value, readForm());
    if (!r.ok) return toast(r.message);
    S.presets = r.presets; renderPresets(); toast(t('t.presetSaved'));
  };
  $('presetImport').onclick = async () => {
    const r = await window.api.importPreset();
    if (r.ok) { S.presets = r.presets; renderPresets(); toast(t('t.presetImported', { name: r.name })); } else if (r.message) toast(r.message);
  };

  $('assetLocal').onclick = async () => {
    toast(t('t.uploading'));
    const r = await window.api.pickAsset();
    if (r.ok) { S.assets = r.assets; renderAssets(); refresh(); toast(t('t.assetAdded')); } else if (r.message) toast(r.message);
  };
  $('assetAdd').onclick = async () => {
    const r = await window.api.addAsset($('assetName').value, $('assetUrl').value);
    if (!r.ok) return toast(r.message);
    S.assets = r.assets; $('assetName').value = ''; $('assetUrl').value = ''; renderAssets(); refresh();
  };
})();
