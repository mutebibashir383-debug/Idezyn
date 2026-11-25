const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { validCall, UDID } = require('./rules');
const firmware = require('./firmware');
const muxd = require('./muxd');

const APPLE_VENDOR = 0x05ac;
const BIN_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(__dirname, '..', 'resources', 'bin');
const STORE_URL = 'ms-windows-store://pdp/?ProductId=9NP83LWLPZ9K';
const STORE_WEB = 'https://apps.microsoft.com/store/detail/apple-devices-preview/9NP83LWLPZ9K';
const LONG_RUNNING = new Set(['idevicerestore', 'idevicebackup2']);
const children = new Set();
const state = { backupDir: null, ipswPath: null };
let win = null, updater = null, busy = false, fwAbort = null;

function log(message) {
  try {
    const dir = app.getPath('logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'open.log'), `${new Date().toISOString()} ${message}\n`);
  } catch (_) { /* logging must never crash the app */ }
}
process.on('uncaughtException', e => log('uncaught: ' + (e && e.stack || e)));
process.on('unhandledRejection', e => log('unhandled: ' + (e && e.stack || e)));

const trusted = e => !!win && e.sender === win.webContents && !!e.senderFrame && e.senderFrame.url.startsWith('file://');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url.startsWith('mailto:')) shell.openExternal(url);
  });
  contents.on('will-attach-webview', e => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('mailto:')) shell.openExternal(url);
    return { action: 'deny' };
  });
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'), title: 'Open', backgroundColor: '#0D0820', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, devTools: !app.isPackaged
    }
  });
  const ses = win.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'usb'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'usb');
  ses.setDevicePermissionHandler(d => d.deviceType === 'usb' && d.device.vendorId === APPLE_VENDOR);
  ses.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    const dev = details.deviceList.find(d => d.vendorId === APPLE_VENDOR);
    callback(dev ? dev.deviceId : undefined);
  });
  win.webContents.on('render-process-gone', (_e, d) => { log('renderer gone: ' + d.reason); if (win) win.reload(); });
  win.on('unresponsive', () => log('window unresponsive'));
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

ipcMain.handle('tool', (event, name, args) => new Promise(resolve => {
  if (!trusted(event)) return resolve({ ok: false, out: 'Blocked' });
  if (!validCall(name, args, state)) { log('rejected call: ' + name); return resolve({ ok: false, out: 'Unsupported operation' }); }
  const exe = path.join(BIN_DIR, name + (process.platform === 'win32' ? '.exe' : ''));
  if (!fs.existsSync(exe)) return resolve({ ok: false, missing: true, out: `${name} is missing from this installation.` });
  const long = LONG_RUNNING.has(name);
  if (long && busy) return resolve({ ok: false, out: 'Another operation is already running.' });
  if (long) busy = true;
  let out = '', done = false;
  const child = spawn(exe, args, { cwd: BIN_DIR, windowsHide: true });
  children.add(child);
  const timer = setTimeout(() => child.kill(), 3 * 60 * 60 * 1000);
  const finish = r => { if (done) return; done = true; clearTimeout(timer); children.delete(child); if (long) busy = false; log(`${name} exit ${r.ok}`); resolve(r); };
  const feed = chunk => { const t = chunk.toString(); out += t; if (win) win.webContents.send('tool-out', t); };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  child.on('error', err => finish({ ok: false, out: err.message }));
  child.on('close', code => finish({ ok: code === 0, out: out.trim() }));
}));

ipcMain.handle('pick-dir', async event => {
  if (!trusted(event)) return null;
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Choose a backup folder' });
  state.backupDir = r.canceled ? null : r.filePaths[0];
  return state.backupDir;
});

const REPORT_EXT = /\.(ips|crash|panic|synced|txt|log)$/i;
function listReports(target, out, depth) {
  let st;
  try { st = fs.statSync(target); } catch (_) { return; }
  if (st.isDirectory()) {
    if (depth > 4) return;
    let names;
    try { names = fs.readdirSync(target); } catch (_) { return; }
    names.forEach(n => listReports(path.join(target, n), out, depth + 1));
  } else if (REPORT_EXT.test(target) && st.size > 0 && st.size <= 3e6) out.push({ full: target, mtime: st.mtimeMs });
}
function readReports(targets, root) {
  const found = [];
  targets.forEach(t => listReports(t, found, 0));
  found.sort((a, b) => b.mtime - a.mtime);
  const out = [];
  let total = 0;
  for (const f of found.slice(0, 120)) {
    try {
      const text = fs.readFileSync(f.full, 'utf8').slice(0, 250000);
      if (text.includes('\u0000')) continue;
      total += text.length;
      if (total > 15e6) break;
      out.push({ name: root ? path.relative(root, f.full) : path.basename(f.full), mtime: f.mtime, text });
    } catch (_) { /* unreadable file */ }
  }
  return out;
}

ipcMain.handle('crash-collect', async (event, udid) => {
  if (!trusted(event)) return { ok: false, message: 'Blocked' };
  const exe = path.join(BIN_DIR, 'idevicecrashreport' + (process.platform === 'win32' ? '.exe' : ''));
  if (!fs.existsSync(exe)) return { ok: false, message: 'idevicecrashreport is missing from this installation.' };
  const target = typeof udid === 'string' && UDID.test(udid) ? ['-u', udid] : [];
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'open-crash-'));
  const run = args => new Promise(resolve => execFile(exe, args, { cwd: BIN_DIR, timeout: 180000, windowsHide: true, maxBuffer: 1 << 24 },
    (err, so, se) => resolve({ ok: !err, out: `${so || ''}${se || ''}`.trim() })));
  try {
    let r = await run(['-k', '-e', ...target, dir]);
    if (!r.ok) r = await run(['-k', ...target, dir]);
    const files = readReports([dir], dir);
    if (!files.length && !r.ok) return { ok: false, message: r.out || 'No crash reports could be read. Unlock the device, tap Trust and try again.' };
    return { ok: true, files };
  } catch (e) {
    log('crash: ' + e.message);
    return { ok: false, message: e.message };
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp cleanup */ } }
});

ipcMain.handle('crash-open', async (event, kind) => {
  if (!trusted(event)) return { ok: false, message: 'Blocked' };
  const folder = kind === 'folder';
  const r = await dialog.showOpenDialog(win, folder
    ? { properties: ['openDirectory'], title: 'Choose a folder of crash reports' }
    : { properties: ['openFile', 'multiSelections'], title: 'Choose crash reports', filters: [{ name: 'Crash reports', extensions: ['ips', 'crash', 'panic', 'synced', 'txt', 'log'] }] });
  if (r.canceled) return { ok: false, canceled: true };
  return { ok: true, files: readReports(r.filePaths, folder ? r.filePaths[0] : null) };
});

ipcMain.handle('fw-download', async (event, req) => {
  if (!trusted(event) || !req || typeof req !== 'object') return { ok: false, message: 'Blocked' };
  if (fwAbort) return { ok: false, message: 'A download is already running.' };
  const name = String(req.name || '').replace(/[^\w.-]/g, '_').slice(0, 120);
  if (!/\.ipsw$/i.test(name)) return { ok: false, message: 'Invalid file name' };
  fwAbort = new AbortController();
  let last = 0;
  try {
    const r = await firmware.download({
      url: String(req.url), name, sha1: req.sha1 ? String(req.sha1) : '', size: Number(req.size) || 0,
      dir: path.join(app.getPath('userData'), 'firmware'), signal: fwAbort.signal,
      onProgress: (got, total) => { const now = Date.now(); if (win && now - last > 250) { last = now; win.webContents.send('fw-progress', { got, total }); } }
    });
    state.ipswPath = r.path;
    return { ok: true, path: r.path, cached: r.cached };
  } catch (e) {
    log('firmware: ' + e.message);
    return { ok: false, message: e.message };
  } finally { fwAbort = null; }
});
ipcMain.handle('fw-cancel', event => { if (trusted(event) && fwAbort) fwAbort.abort(); });

ipcMain.handle('save-pdf', async (event, html, name) => {
  if (!trusted(event) || typeof html !== 'string' || html.length > 2e6) return { ok: false, message: 'Blocked' };
  const view = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false, contextIsolation: true } });
  try {
    await view.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await view.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    const base = String(name || 'open-report').replace(/[^\w.-]/g, '_').slice(0, 80);
    const r = await dialog.showSaveDialog(win, { defaultPath: base + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, pdf);
    return { ok: true, path: r.filePath };
  } catch (e) {
    log('pdf: ' + e.message);
    return { ok: false, message: e.message };
  } finally { view.destroy(); }
});

const MUX_KEYS = ['ProductType', 'ProductVersion', 'BuildVersion', 'DeviceName', 'DeviceClass', 'UniqueDeviceID', 'SerialNumber', 'ModelNumber', 'RegionInfo', 'HardwareModel', 'ActivationState', 'PasswordProtected', 'InternationalMobileEquipmentIdentity', 'DeviceColor'];
ipcMain.handle('mux-devices', async event => {
  if (!trusted(event)) return { ok: false };
  try { return { ok: true, devices: await muxd.listDevices() }; } catch (e) { return { ok: false, message: e.message }; }
});
ipcMain.handle('mux-info', async (event, id) => {
  if (!trusted(event) || !Number.isInteger(id)) return { ok: false };
  try { return { ok: true, info: await muxd.lockdownInfo(undefined, id, MUX_KEYS) }; } catch (e) { return { ok: false, message: e.message }; }
});

const TOOL_NAMES = ['idevice_id', 'ideviceinfo', 'ideviceenterrecovery', 'irecovery', 'idevicerestore', 'idevicebackup2', 'idevicediagnostics', 'idevicecrashreport'];
ipcMain.handle('tools-status', event => {
  if (!trusted(event)) return { present: [], missing: [] };
  const ext = process.platform === 'win32' ? '.exe' : '';
  const present = TOOL_NAMES.filter(n => fs.existsSync(path.join(BIN_DIR, n + ext)));
  return { present, missing: TOOL_NAMES.filter(n => !present.includes(n)) };
});

// Apple's USB driver and service come with Apple Devices or iTunes. Several independent
// checks are used because the Microsoft Store and the classic installers register differently.
const runText = (cmd, args) => new Promise(resolve => execFile(cmd, args, { windowsHide: true, timeout: 15000, maxBuffer: 1 << 23 }, (err, out) => resolve(err ? '' : String(out))));
let appleSupportFound = '';
async function findAppleSupport() {
  if (await muxd.reachable()) return 'Apple Mobile Device service';
  const roots = [process.env.CommonProgramFiles, process.env['CommonProgramFiles(x86)'], process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  for (const r of roots) {
    if (fs.existsSync(path.join(r, 'Apple', 'Mobile Device Support')) || fs.existsSync(path.join(r, 'iTunes'))) return 'Apple software folder';
  }
  if (/Apple Mobile Device/i.test(await runText('sc', ['query', 'type=', 'service', 'state=', 'all']))) return 'Apple service';
  if (/usbaapl|Apple Mobile Device/i.test(await runText('sc', ['query', 'type=', 'driver', 'state=', 'all']))) return 'Apple USB driver';
  if (/AppleInc\./i.test(await runText('powershell', ['-NoProfile', '-NonInteractive', '-Command', "(Get-AppxPackage -Name 'AppleInc.*').Name"]))) return 'Microsoft Store app';
  return '';
}
ipcMain.handle('driver-status', async event => {
  if (!trusted(event) || process.platform !== 'win32') return { needed: false, installed: true };
  if (!appleSupportFound) appleSupportFound = await findAppleSupport();
  return { needed: true, installed: !!appleSupportFound, via: appleSupportFound };
});
ipcMain.handle('open-store', async event => {
  if (!trusted(event)) return;
  try { await shell.openExternal(STORE_URL); } catch (_) { await shell.openExternal(STORE_WEB); }
});

function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    updater = require('electron-updater').autoUpdater;
    updater.on('update-available', i => win && win.webContents.send('update', { state: 'available', version: i.version }));
    updater.on('update-downloaded', i => win && win.webContents.send('update', { state: 'downloaded', version: i.version }));
    updater.on('error', e => log('updater: ' + (e && e.message)));
    updater.checkForUpdates().catch(() => {});
  } catch (e) { log('updater unavailable: ' + e.message); updater = null; }
}
ipcMain.handle('update-check', async event => {
  if (!trusted(event)) return 'Blocked';
  if (!updater) return 'Updates are checked in the installed app.';
  try {
    const r = await updater.checkForUpdates();
    return r && r.updateInfo.version !== app.getVersion() ? 'Update found: ' + r.updateInfo.version : 'You are up to date.';
  } catch (e) { return 'Update check failed: ' + e.message; }
});
ipcMain.handle('update-install', event => { if (trusted(event) && updater) updater.quitAndInstall(); });

app.on('before-quit', () => children.forEach(c => { try { c.kill(); } catch (_) { /* already exited */ } }));
app.whenReady().then(() => { createWindow(); setupUpdater(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
