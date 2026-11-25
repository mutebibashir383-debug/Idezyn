// Device identification and live detection, the home and repair pages, Apple driver check,
// faster Recovery Mode exit, and the support message form.

const IPHONE_NAMES = {
  'iPhone1,1': 'iPhone', 'iPhone1,2': 'iPhone 3G', 'iPhone2,1': 'iPhone 3GS', 'iPhone3,1': 'iPhone 4', 'iPhone3,2': 'iPhone 4', 'iPhone3,3': 'iPhone 4',
  'iPhone4,1': 'iPhone 4s', 'iPhone5,1': 'iPhone 5', 'iPhone5,2': 'iPhone 5', 'iPhone5,3': 'iPhone 5c', 'iPhone5,4': 'iPhone 5c',
  'iPhone6,1': 'iPhone 5s', 'iPhone6,2': 'iPhone 5s', 'iPhone7,2': 'iPhone 6', 'iPhone7,1': 'iPhone 6 Plus', 'iPhone8,1': 'iPhone 6s',
  'iPhone8,2': 'iPhone 6s Plus', 'iPhone8,4': 'iPhone SE (1st generation)', 'iPhone9,1': 'iPhone 7', 'iPhone9,3': 'iPhone 7',
  'iPhone9,2': 'iPhone 7 Plus', 'iPhone9,4': 'iPhone 7 Plus', 'iPhone10,1': 'iPhone 8', 'iPhone10,4': 'iPhone 8', 'iPhone10,2': 'iPhone 8 Plus',
  'iPhone10,5': 'iPhone 8 Plus', 'iPhone10,3': 'iPhone X', 'iPhone10,6': 'iPhone X', 'iPhone11,2': 'iPhone XS', 'iPhone11,4': 'iPhone XS Max',
  'iPhone11,6': 'iPhone XS Max', 'iPhone11,8': 'iPhone XR', 'iPhone12,1': 'iPhone 11', 'iPhone12,3': 'iPhone 11 Pro', 'iPhone12,5': 'iPhone 11 Pro Max',
  'iPhone12,8': 'iPhone SE (2nd generation)', 'iPhone13,1': 'iPhone 12 mini', 'iPhone13,2': 'iPhone 12', 'iPhone13,3': 'iPhone 12 Pro',
  'iPhone13,4': 'iPhone 12 Pro Max', 'iPhone14,4': 'iPhone 13 mini', 'iPhone14,5': 'iPhone 13', 'iPhone14,2': 'iPhone 13 Pro',
  'iPhone14,3': 'iPhone 13 Pro Max', 'iPhone14,6': 'iPhone SE (3rd generation)', 'iPhone14,7': 'iPhone 14', 'iPhone14,8': 'iPhone 14 Plus',
  'iPhone15,2': 'iPhone 14 Pro', 'iPhone15,3': 'iPhone 14 Pro Max', 'iPhone15,4': 'iPhone 15', 'iPhone15,5': 'iPhone 15 Plus',
  'iPhone16,1': 'iPhone 15 Pro', 'iPhone16,2': 'iPhone 15 Pro Max', 'iPhone17,3': 'iPhone 16', 'iPhone17,4': 'iPhone 16 Plus',
  'iPhone17,1': 'iPhone 16 Pro', 'iPhone17,2': 'iPhone 16 Pro Max', 'iPhone17,5': 'iPhone 16e'
};

const clean = s => String(s == null ? '' : s).replace(/[<>&"'`]/g, '');
const normUdid = s => String(s || '').replace(/-/g, '').toUpperCase();
const modeIs = (...modes) => !!S.dev && modes.includes(S.dev.mode);

// ---------- identification ----------
function applyLockdown(o, k) {
  const put = (field, value, fn) => { if (value !== undefined && value !== null && value !== '') o[field] = fn ? fn(value) : clean(value); };
  put('product', k.ProductType);
  put('serial', k.SerialNumber);
  put('activation', k.ActivationState);
  put('passcode', k.PasswordProtected, v => String(v));
  put('build', k.BuildVersion);
  put('imei', k.InternationalMobileEquipmentIdentity);
  put('modelNumber', k.ModelNumber);
  put('region', k.RegionInfo);
  put('color', k.DeviceColor);
  put('deviceName', k.DeviceName);
  if (k.UniqueDeviceID) o.udid = clean(k.UniqueDeviceID);
  if (k.ProductVersion) o.ios = 'iOS ' + clean(k.ProductVersion);
}

async function readNormalMode(o, n) {
  const entry = (S.muxList || []).find(m => normUdid(m.udid) === normUdid(o.udid));
  if (entry) {
    o.muxId = entry.id;
    try { const r = await n.muxInfo(entry.id); if (r && r.ok) applyLockdown(o, r.info); } catch (e) { logEvt('service: ' + e.message); }
  }
  const target = o.udid && /^[0-9A-Fa-f-]{8,64}$/.test(o.udid) ? ['-u', o.udid] : [];
  let r = await n.run('ideviceinfo', target);
  if (!r.ok && !r.missing && target.length) r = await n.run('ideviceinfo', []);
  if (!r.ok) return;
  applyLockdown(o, kvParse(r.out));
  const battery = /BatteryCurrentCapacity:\s*(\d+)/.exec((await n.run('ideviceinfo', [...target, '-q', 'com.apple.mobile.battery'])).out || '');
  if (battery) o.battery = +battery[1];
  const disk = kvParse((await n.run('ideviceinfo', [...target, '-q', 'com.apple.disk_usage'])).out);
  if (disk.TotalDiskCapacity) o.storage = { total: +disk.TotalDiskCapacity, free: +disk.TotalDataAvailable || 0 };
  const power = (await n.run('idevicediagnostics', [...target, 'ioregentry', 'AppleSmartBattery'])).out;
  const design = plistInt(power, 'DesignCapacity'), max = plistInt(power, 'NominalChargeCapacity') || plistInt(power, 'AppleRawMaxCapacity'), cycles = plistInt(power, 'CycleCount');
  if (design && max) o.health = Math.min(100, Math.round(max / design * 100));
  if (cycles !== null) o.cycles = cycles;
}

async function nameDevice(o) {
  let name = IPHONE_NAMES[o.product] || '';
  if (!name) {
    try {
      const db = await getDB();
      const match = db.find(x => x.identifier === o.product) ||
        (o.cpid && o.bdid && db.find(x => /^(iPhone|iPad|iPod)/.test(x.identifier) && x.cpid == parseInt(o.cpid, 16) && x.bdid == parseInt(o.bdid, 16)));
      if (match) { o.product = clean(match.identifier); name = IPHONE_NAMES[o.product] || clean(match.name); }
    } catch (e) { /* offline and nothing saved yet */ }
  }
  o.model = name || o.product || (o.chip ? 'Apple device · ' + o.chip + ' chip' : 'Apple device');
}

enrich = async function (o) {
  const n = window.native;
  if (o.mode === 'Normal Mode') {
    o.udid = o.udid || fmtUdid(o.handle ? o.handle.serialNumber || '' : '');
    if (n) await readNormalMode(o, n);
  } else if (n && o.ecid) {
    const r = await n.run('irecovery', ['-i', '0x' + o.ecid.replace(/^0x/i, ''), '-q']);
    if (r.ok) { const k = kvParse(r.out); if (k.PRODUCT) o.product = k.PRODUCT; o.board = k.MODEL; }
  }
  await nameDevice(o);
  o.tries = (o.tries || 0) + 1;
  o.lastTry = Date.now();
  return o;
};

// ---------- live detection ----------
const announce = o => { toast('Device detected: ' + o.model + ' · ' + o.mode); logEvt('detected ' + o.model + ' ' + o.mode); };
const needsRetry = o => o.mode === 'Normal Mode' && !o.product && o.tries < 8 && Date.now() - o.lastTry > 2500;

scanAll = async function () {
  if (scanning) return;
  scanning = true;
  try {
    let usb = [], mux = [];
    if (navigator.usb) { try { usb = (await navigator.usb.getDevices()).filter(x => x.vendorId === 0x05ac); } catch (e) { usb = []; } }
    if (window.native) { try { const r = await native.muxDevices(); if (r && r.ok) mux = r.devices; } catch (e) { mux = []; } }
    S.muxList = mux;
    const out = [], seen = new Set();
    for (const d of usb) {
      let o = CACHE.get(devKey(d));
      if (!o) { try { o = await Engine.detect(d); CACHE.set(devKey(d), o); announce(o); } catch (e) { continue; } }
      o.handle = d; out.push(o);
      if (o.udid) seen.add(normUdid(o.udid));
    }
    for (const m of mux) {
      const id = normUdid(m.udid);
      if (seen.has(id)) continue;
      let o = CACHE.get('mux:' + id);
      if (!o) {
        o = await enrich({ handle: null, source: 'service', mode: 'Normal Mode', udid: fmtUdid(m.udid), muxId: m.id, ios: 'Not readable until trusted', model: 'Apple device' });
        CACHE.set('mux:' + id, o); announce(o);
      }
      out.push(o); seen.add(id);
    }
    const live = new Set([...usb.map(devKey), ...mux.map(m => 'mux:' + normUdid(m.udid))]);
    for (const k of [...CACHE.keys()]) if (!live.has(k)) CACHE.delete(k);
    for (const o of out) if (needsRetry(o)) await enrich(o);
    S.devs = out;
    if (!S.dev || !out.includes(S.dev)) S.dev = out[0] || null;
    const sig = out.map(o => [o.udid || o.ecid || o.serial, o.mode, o.model, o.ios].join('~')).join('|') + '*' + (S.dev ? (S.dev.udid || S.dev.ecid || '') : '');
    if (sig !== lastSig) { lastSig = sig; render(); }
  } finally { scanning = false; }
};
autoDetect = scanAll;

detect = async function () {
  toast('Scanning for devices…');
  await scanAll();
  if (S.dev) { toast('Device detected: ' + S.dev.model); render(); return; }
  modal('<h2>No device detected</h2><p class="mut">Use a data cable, unlock the iPhone and tap Trust. On Windows, Apple Devices or iTunes must be installed. For a dead or frozen device, put it into Recovery Mode first.</p><button class="btn" data-act="mx2">OK</button>');
};

// ---------- Apple Devices check (Windows) ----------
checkDriver = async function (mode = 'poll') {
  if (!window.native || native.platform !== 'win32' || store.get('driverOk', false)) return;
  let installed = S.devs.length > 0;
  if (!installed) { try { installed = (await native.driverStatus()).installed; } catch (e) { installed = false; } }
  if (installed) {
    clearInterval(drvTimer); drvTimer = null;
    if (mode !== 'first') { if ($('#modal .drv')) closeM(); toast('Apple Devices found. Connect your iPhone.'); }
    return;
  }
  if (mode === 'first') {
    modal('<div class="drv"><h2>Apple Devices was not found</h2><p class="mut">Windows needs Apple’s free USB driver to talk to an iPhone. Open could not find it on this computer.</p><ol class="mut"><li>Click Install Apple Devices, then press Get in the Store.</li><li>Come back here when it finishes. Open checks again automatically.</li></ol><div class="row"><button class="btn" data-act="store">Install Apple Devices</button><button class="btn sec" data-act="drvchk">Check again</button><button class="btn sec" data-act="drvskip">I already have it</button><button class="btn sec" data-act="mx2">Not now</button></div></div>');
    drvTimer = setInterval(checkDriver, 4000);
  } else if (mode === 'manual') toast('Still not found. Finish the install, or choose “I already have it”.');
};

// ---------- Recovery Mode exit ----------
function waitForRemoval(dev, ms) {
  return new Promise(resolve => {
    let done = false, poll = null, timer = null;
    const onGone = e => { if (e.device === dev.handle) finish(true); };
    const finish = v => {
      if (done) return;
      done = true; clearInterval(poll); clearTimeout(timer);
      if (navigator.usb) navigator.usb.removeEventListener('disconnect', onGone);
      resolve(v);
    };
    if (navigator.usb) navigator.usb.addEventListener('disconnect', onGone);
    poll = setInterval(async () => {
      try { if (!(await navigator.usb.getDevices()).includes(dev.handle)) finish(true); } catch (e) { /* keep waiting */ }
    }, 300);
    timer = setTimeout(() => finish(false), ms);
  });
}

Engine.exitRecovery = async function () {
  const d = S.dev;
  if (!d) throw new Error('No device connected.');
  if (d.mode === 'DFU Mode') throw new Error('DFU Mode has no software exit command. Hold Volume Up, Volume Down, then the Side button until the Apple logo appears, or hold the buttons for about 10 seconds to restart.');
  if (d.mode !== 'Recovery Mode') throw new Error('The device is not in Recovery Mode.');
  if (!window.native) throw new Error('Leaving Recovery Mode needs the Open desktop app.');
  const ecid = d.ecid ? ['-i', '0x' + d.ecid.replace(/^0x/i, '')] : [];
  const gone = waitForRemoval(d, 8000);
  const r = await native.run('irecovery', [...ecid, '-n']);
  if (r.missing) throw new Error('The device tool irecovery is missing from this copy of Open, so it cannot restart the device. Install the Open installer built by GitHub (it includes the tool), or copy the tools into resources/bin.');
  if (!r.ok) throw new Error('The device tool reported an error: ' + (r.out || 'unknown') + '. Try another cable or USB port.');
  if (!(await gone)) throw new Error('The restart command was accepted but the device did not leave Recovery Mode. Try again, or hold the buttons to force a restart.');
  return true;
};
exitGo = async function () { await exitRun(); };

// ---------- home page ----------
const detectBtn = () => S.dev
  ? '<button class="btn found" data-act="detect">Device detected</button>'
  : '<button class="btn missing" data-act="detect" data-tip="Scans USB for an Apple device">Detect Device</button>';

function toolsBanner() {
  const t = S.tools;
  if (!window.native || !t || !t.missing.length) return '';
  const none = !t.present.length;
  return `<div class="card note"><b>${none ? 'Device tools are not installed in this copy of Open' : 'Some device tools are missing'}</b><p class="mut">Open can still detect devices, but ${none ? 'it cannot leave Recovery Mode, back up, update or restore without them' : 'some actions need ' + t.missing.map(h).join(', ')}. The installer built by the GitHub workflow includes them. When running from source, copy them into <code>resources/bin</code>.</p></div>`;
}

P.home = () => {
  const d = S.dev;
  const facts = d ? [['Mode', d.mode], ['Operating system', d.ios], ['Chip', d.chip], ['Serial number', d.serial]].filter(x => x[1]) : [];
  const usb = `<svg viewBox="0 0 24 24" width="54" height="54" aria-hidden="true" style="stroke:var(--or);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round">${I.usb}</svg>`;
  const cards = [['enter', 'Enter Recovery Mode', 'Step-by-step, model-specific button guide.'], ['exit', 'Exit Recovery Mode', 'Verify your device and attempt a supported exit.'], ['repair', 'iOS System Repair', 'Diagnose Apple logo, boot loop and update issues.']];
  return `<div class="fade"><h1>Welcome to Open</h1><p class="mut">Your intelligent iPhone recovery and system repair assistant.</p>${toolsBanner()}
<div class="card" style="margin:22px 0">${pill()}<h2 class="devname">${d ? h(d.model) : 'No device detected'}</h2>
${d ? `<table class="facts">${facts.map(f => `<tr><td>${h(f[0])}</td><td>${h(f[1])}</td></tr>`).join('')}</table>` : `<div class="usb" style="margin:10px 0">${usb}</div><p class="mut">Connect your iPhone to begin.</p>`}
<div class="row">${detectBtn()}</div><p class="mut" style="font-size:14px">Engine: ${Engine.name}</p></div>
${S.devs.length > 1 ? `<div class="card" style="margin-bottom:18px"><h2>Connected devices (${S.devs.length})</h2><p class="mut">Choose which one to work on. Restores run one at a time.</p><div class="devs">${S.devs.map((o, i) => `<button data-act="selectdev:${i}" aria-pressed="${o === S.dev}">${h(o.model)} · ${h(o.mode)}</button>`).join('')}</div></div>` : ''}
<div class="grid g3">${cards.map(c => `<div class="card"><div class="ico">${ic(c[0])}</div><h2>${c[1]}</h2><p class="mut">${c[2]}</p><button class="btn" data-act="go:${c[0]}">Open</button></div>`).join('')}</div></div>`;
};

const _info2 = P.info;
P.info = () => _info2()
  .replace('<button class="btn" data-act="detect">Detect Device</button>', detectBtn())
  .replace(/<tr><td>Data source<\/td><td>[^<]*<\/td><\/tr>/, `<tr><td>Data source</td><td>${S.dev ? (S.dev.source === 'service' ? 'Apple Mobile Device service' : 'USB descriptor') : '—'}</td></tr>`)
  .replace(/(<tr><td>Model<\/td><td>[^<]*<\/td><\/tr>)/, `$1${S.dev && S.dev.deviceName ? `<tr><td>Device name</td><td>${h(S.dev.deviceName)}</td></tr>` : ''}`);

// ---------- repair page ----------
REP[0][2] = 'A device Open can see (any mode) and a USB data cable'; REP[0][3] = 'Any iPhone, iPad or iPod touch Apple still signs iOS for';
REP[1][2] = 'A stable connection and at least 20% battery'; REP[1][3] = 'Any iPhone, iPad or iPod touch Apple still signs iOS for';
REP[2][2] = 'Device in Recovery Mode and a USB data cable'; REP[2][3] = 'Any iPhone, iPad or iPod touch in Recovery or DFU Mode';
REP[3][2] = 'A USB data cable; charge the device for 30 minutes first'; REP[3][3] = 'Any iPhone, iPad or iPod touch';
REP[4][2] = 'A backup if the device runs, and Recovery or DFU Mode'; REP[4][3] = 'Any iPhone, iPad or iPod touch Apple still signs iOS for';
const ERASES = new Set([4]);

async function ensureFirmware(d) {
  if (!d || !d.product || (S.fwInfo && S.fwInfo.product === d.product)) return;
  S.fwInfo = { product: d.product, fw: undefined };
  try { const fw = await Engine.firmware(d.product); S.fwInfo = { product: d.product, fw }; S.fw = fw; S.fwProduct = d.product; }
  catch (e) { S.fwInfo = { product: d.product, fw: null, error: e.message }; }
  if (S.page === 'repair') render();
}

function repairState(i) {
  const d = S.dev, t = S.tools;
  if (!d) return { ok: false, label: 'Connect a device to use this' };
  if (window.native && t && t.missing.includes('idevicerestore')) return { ok: false, label: 'The restore tool is missing from this copy of Open' };
  if (i === 2 && d.mode === 'Normal Mode') return { ok: false, label: 'Put the device into Recovery Mode first', act: 'go:enter', btn: 'Show steps' };
  return { ok: true, label: 'Ready for ' + d.model + ' (' + d.mode + ')', act: 'rep:' + i, btn: 'Continue' };
}

function firmwareLine() {
  const d = S.dev, f = S.fwInfo;
  if (!d || !d.product) return 'Model not identified yet';
  if (!f || f.fw === undefined) return 'Looking up the newest iOS Apple signs for ' + h(d.model) + '…';
  if (f.fw) return 'Newest signed iOS for ' + h(d.model) + ': <b>' + h(f.fw.version) + '</b> (' + (f.fw.filesize / 1e9).toFixed(1) + ' GB)' + (f.fw.cached ? ' · saved copy' : '');
  return f.error ? 'Could not look up iOS versions: ' + h(f.error) : 'Apple is not signing any iOS for ' + h(d.model);
}

P.repair = () => {
  const d = S.dev; ensureFirmware(d);
  return `<div class="fade"><h1>iOS System Repair</h1><p class="mut">Every option below works on the connected device. Pick one and Open runs checks for that exact model before anything changes.</p>
<div class="card" style="margin:16px 0">${d ? `<b>${h(d.model)}</b> · ${h(d.mode)}${d.ios ? ' · ' + h(d.ios) : ''}` : '<b>No device connected</b>'}<p class="mut" style="margin:6px 0 0">${firmwareLine()}</p></div>
<div class="grid g3">${REP.map((r, i) => {
    const s = repairState(i);
    return `<div class="card"><div class="ico">${ic('repair')}</div><div>${ERASES.has(i) ? '<span class="badge erase" style="margin:0">Erases data</span>' : '<span class="badge keep" style="margin:0">Keeps data</span>'}</div><h2 style="margin-top:10px">${h(r[0])}</h2><p class="mut">${h(r[1])}</p><p style="font-size:14px"><b>Requires:</b> ${h(r[2])}</p><p style="font-size:14px"><span class="dot ${s.ok ? 'ok' : 'wr'}"></span> ${h(s.label)}</p>${s.act ? `<button class="btn" data-act="${s.act}">${s.btn}</button>` : '<button class="btn" disabled>Continue</button>'}</div>`;
  }).join('')}
<div class="card"><div class="ico">${ic('info')}</div><h2>Frozen or unresponsive</h2><p class="mut">Try a force restart before repair.</p><button class="btn sec" data-act="force">View steps</button></div>
<div class="card"><div class="ico">${ic('info')}</div><h2>Leave iOS beta</h2><p class="mut">Return to the public version.</p><button class="btn sec" data-act="beta">View steps</button></div></div></div>`;
};

repair = function (i) {
  const r = REP[i], d = S.dev, f = S.fwInfo, line = (ok, text) => `<tr><td style="width:30px">${ok ? '✔' : '⚠'}</td><td>${text}</td></tr>`;
  if (!d) return modal('<h2>No device connected</h2><p class="mut">Connect an iPhone, iPad or iPod touch first. Open checks the exact model before any repair.</p><button class="btn" data-act="mx2">OK</button>');
  const recoveryNeeded = i === 2 && d.mode === 'Normal Mode';
  const rows = [
    line(true, 'Device: <b>' + h(d.model) + '</b> · ' + h(d.mode) + (d.ios ? ' · ' + h(d.ios) : '')),
    line(!recoveryNeeded, recoveryNeeded ? 'This repair needs Recovery Mode. Use Enter Recovery Mode first.' : 'Mode is suitable for this repair'),
    line(!!(f && f.fw), f && f.fw ? 'Newest signed iOS for this model: <b>' + h(f.fw.version) + '</b>' : 'Signed iOS for this model not confirmed yet'),
    line(!ERASES.has(i), ERASES.has(i) ? 'This option <b>erases all data</b>. Back up first if the device runs.' : 'Keeps your data in most cases'),
    line(S.devs.length < 2, S.devs.length < 2 ? 'Only one device is connected' : 'Disconnect the other devices before restoring')
  ].join('');
  modal(`<h2>${h(r[0])}</h2><p class="mut">${h(r[1])}</p><table>${rows}</table><p><b>Before you start</b></p>${['Cable is connected and the device is unlocked (if it runs)', 'I have backed up important data', 'The device has at least 20% battery'].map(x => `<label style="display:block;margin:6px 0"><input type="checkbox" class="chk"> ${x}</label>`).join('')}<div class="row" style="margin-top:16px"><button class="btn" data-act="repgo:${i}">Start diagnosis</button><button class="btn sec" data-act="mx2">Cancel</button></div>`);
};

// ---------- support: email choices and message form ----------
function mailChoice(subject, body) {
  const text = String(body || '').slice(0, 1500), q = encodeURIComponent, to = APP.support;
  S.mailDraft = { subject, body: String(body || '') };
  const link = (url, label, primary) => `<a class="btn${primary ? '' : ' sec'}" href="${h(url)}" target="_blank" rel="noopener">${label}</a>`;
  modal(`<h2>Send an email</h2><p class="mut">Choose how to send it to <b>${h(to)}</b>. Your message is already filled in.</p><div class="row">${link('mailto:' + to + '?subject=' + q(subject) + '&body=' + q(text), 'Open my email app', true)}${link('https://mail.google.com/mail/?view=cm&fs=1&to=' + q(to) + '&su=' + q(subject) + '&body=' + q(text), 'Gmail')}${link('https://outlook.office.com/mail/deeplink/compose?to=' + q(to) + '&subject=' + q(subject) + '&body=' + q(text), 'Outlook')}</div><div class="row" style="margin-top:12px"><button class="btn sec" data-act="copyaddr">Copy email address</button><button class="btn sec" data-act="copymsg">Copy message</button><button class="btn sec" data-act="mx2">Close</button></div><p class="mut" style="font-size:14px">If nothing opens, copy the address and message and paste them into any email app.</p>`);
}

async function contactSend() {
  const message = (($('#cmsg') || {}).value || '').trim(), reply = (($('#cmail') || {}).value || '').trim(), withReport = !!($('#cdiag') || {}).checked;
  if (!message) return toast('Please type your message first.');
  const text = message + (reply ? '\n\nReply to: ' + reply : '') + (withReport ? '\n\n--- Report ---\n' + supportReport(false) : '');
  const subject = 'Open support message';
  if (!APP.contactUrl) return mailChoice(subject, text);
  modal('<div class="spin"></div><p style="text-align:center">Sending your message…</p>');
  try {
    const res = await fetch(APP.contactUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: APP.contactKey || undefined, subject, from_name: 'Open app', email: reply || undefined, message: text })
    });
    if (!res.ok) throw new Error('The server answered ' + res.status);
    logEvt('support message sent');
    modal('<h2>Message sent</h2><p class="mut">Thank you. We will reply as soon as we can.</p><button class="btn" data-act="mx2">Close</button>');
  } catch (e) {
    logEvt('support message failed: ' + e.message);
    mailChoice(subject, text);
  }
}

const _help2 = P.help;
P.help = () => _help2() + `<div class="card" style="margin-top:18px"><h2>Send us a message</h2><p class="mut">Tell us what happened. We read every message.</p>
<label for="cmsg">Your message</label><textarea id="cmsg" class="sw" style="margin:8px 0" placeholder="What were you doing, and what went wrong?"></textarea>
<label for="cmail">Your email (optional, so we can reply)</label><input id="cmail" class="sw" type="email" style="width:100%;margin:8px 0">
<label style="display:block;margin:8px 0"><input type="checkbox" id="cdiag"> Include a technical report (no serial number or UDID)</label>
<div class="row"><button class="btn" data-act="contactsend">Send message</button></div></div>`;

const DEVACT = {
  contactsend: contactSend,
  mailchoice: (v, el) => mailChoice(el.dataset.subject, el.dataset.body),
  copyaddr: () => navigator.clipboard && navigator.clipboard.writeText(APP.support).then(() => toast('Email address copied'), () => {}),
  copymsg: () => navigator.clipboard && S.mailDraft && navigator.clipboard.writeText(S.mailDraft.body).then(() => toast('Message copied'), () => {}),
  drvskip: () => { store.set('driverOk', true); closeM(); toast('Okay. Open will not ask again.'); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const name = el.dataset.act.split(':')[0];
  if (DEVACT[name]) DEVACT[name](el.dataset.act.split(':')[1], el, e);
});

// ---------- start-up ----------
if (window.native) native.toolsStatus().then(t => { S.tools = t; render(); }).catch(() => {});
setInterval(() => { if (!document.hidden) scanAll(); }, 2000);
render();
scanAll();
