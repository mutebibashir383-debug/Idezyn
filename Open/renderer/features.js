const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
const LOG = [];
function logEvt(m) { LOG.push(new Date().toISOString().slice(11, 19) + ' ' + String(m).replace(/\s+/g, ' ').slice(0, 300)); if (LOG.length > 200) LOG.shift(); }
const waLink = t => 'https://wa.me/' + APP.whatsapp + '?text=' + encodeURIComponent(t);
const mailBtn = (subject, body) => `<button class="btn sec" data-act="mailchoice" data-subject="${h(subject)}" data-body="${h(String(body).slice(0, 1500))}">Email</button>`;
const SHOP = () => store.get('shop', { name: '', phone: '', address: '' });
S.customer = store.get('customer', ''); S.devs = []; S.dfu = false; S.wz = null; S.jq = '';

Object.assign(I, {
  wizard: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  jobs: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'
});
NAV.splice(1, 0, ['wizard', 'What’s Wrong?']);
NAV.splice(6, 0, ['jobs', 'Jobs & Reports']);

// error explainer
const ERRORS = [
  { codes: ['9'], t: 'Connection lost during update or restore', c: 'The USB link dropped or the device could not be reached. This is usually a cable, port or driver problem.',
    s: ['Use an original or certified data cable, plugged straight into the computer (no hub).', 'Try another USB port, then restart the computer and the device.', 'On Windows, update Apple Devices or iTunes.', 'Try another computer. If it fails the same way, restore from DFU Mode.'] },
  { codes: ['14'], t: 'File or USB problem', c: 'The firmware file could not be read, or the USB link is unreliable.',
    s: ['Change the cable and port.', 'Let Open download the firmware again; it verifies the file.', 'Pause security software during the restore.', 'Try another computer.'] },
  { codes: ['1015'], t: 'Older iOS is not allowed', c: 'Going back to that older iOS is not allowed, usually because Apple no longer signs it.',
    s: ['Install the newest signed iOS (Open picks it for you).', 'If the device is stuck, use Erase & Restore from DFU Mode.'] },
  { codes: ['3194'], t: 'Apple would not approve this iOS', c: 'The iOS version is no longer signed, or the computer cannot reach Apple’s signing server.',
    s: ['Install the newest signed iOS.', 'Check the internet connection and turn off VPNs, proxies and strict firewalls.', 'Remove any line mentioning “gs.apple.com” from the computer’s hosts file.'] },
  { codes: ['4013', '4014'], t: 'Connection interrupted during restore', c: 'Often a USB problem. If it repeats on different cables and computers, it can be a hardware fault (battery, storage or board).',
    s: ['Restore from DFU Mode.', 'Try a different cable, port and computer.', 'If it keeps failing, take the device to a repair shop for a hardware check.'] },
  { codes: ['4005'], t: 'Restore failed', c: 'Commonly hardware related, especially when it happens again after a clean attempt.',
    s: ['Retry from DFU Mode with another cable and computer.', 'If it repeats, the battery, storage or board may need repair.'] },
  { codes: ['2002', '2003'], t: 'USB or security software problem', c: 'Another program may be using the device, or security software is blocking the connection.',
    s: ['Close other iPhone programs (iTunes, Apple Devices, other repair tools).', 'Reconnect the device and try another cable or port.', 'Pause antivirus software briefly.'] },
  { codes: ['1671'], t: 'Firmware is still downloading', c: 'Apple Devices or iTunes is still fetching the iOS file.', s: ['Wait for the download to finish, then try again.'] },
  { codes: ['SPACE'], t: 'Not enough free space on the computer', c: 'The firmware needs a lot of room while it is unpacked.', s: ['Free at least three times the firmware size on the drive, then try again.'] },
  { codes: ['NET'], t: 'Download or network problem', c: 'The connection to Apple’s servers failed.', s: ['Check your internet connection and turn off VPNs.', 'Run it again. Open downloads resume where they stopped.'] }
];
const ERR_PATTERNS = [
  [/unable to (get|request).{0,30}(tss|shsh|ticket)|tss request failed/i, '3194'],
  [/no device found|unable to find device|waiting for device/i, '9'],
  [/asr|unable to connect|send(ing)? .{0,20}fail/i, '4013'],
  [/no space|not enough (free )?space|disk full/i, 'SPACE'],
  [/download.{0,20}fail|could not download|timed out/i, 'NET']
];
const errCard = e => `<div class="card" style="margin:10px 0"><b>${/^\d/.test(e.codes[0]) ? 'Error ' + e.codes.join(' / ') + ': ' : ''}${h(e.t)}</b><p class="mut">${h(e.c)}</p><ol class="mut">${e.s.map(x => '<li>' + h(x) + '</li>').join('')}</ol></div>`;
function explain(text) {
  const t = String(text || ''), hits = [];
  for (const [re, code] of ERR_PATTERNS) { const e = ERRORS.find(x => x.codes.includes(code)); if (re.test(t) && e && !hits.includes(e)) hits.push(e); }
  for (const m of t.matchAll(/error\D{0,6}(\d{1,4})/gi)) { const e = ERRORS.find(x => x.codes.includes(m[1])); if (e && !hits.includes(e)) hits.push(e); }
  return hits.length ? '<h3>What this usually means</h3>' + hits.slice(0, 2).map(errCard).join('')
    : '<p class="mut">Try a different cable and port, restart the computer and the device, then send us the details from Help & Support.</p>';
}
function lookupHtml(q) {
  q = String(q || '').trim().toLowerCase();
  const list = ERRORS.filter(e => !q || e.codes.some(c => c.toLowerCase().includes(q)) || e.t.toLowerCase().includes(q));
  return list.length ? list.map(errCard).join('') : '<p class="mut">No match. Try 9, 14, 3194, 4013 or 4005.</p>';
}

// device groups: iPad, iPod and DFU
const FACEs = (btn, key) => [['Connect the device', PREP, ['cable'], ''], ['Press Volume Up', 'Press the Volume Up button once and release it quickly.', ['up'], ''], ['Press Volume Down', 'Press the Volume Down button once and release it quickly.', ['down'], ''], ['Hold the ' + btn + ' button', 'Press and hold the ' + btn + ' button. A power-off slider and then the Apple logo may appear. Keep holding through both.', [key], APL], ['Recovery screen', SHOW, [], REC]];
const HOMEs = (btn, key) => [['Connect the device', PREP, ['cable'], ''], ['Hold two buttons', 'Press and hold the Home button and the ' + btn + ' button at the same time.', ['home', key], ''], ['Keep holding', 'Keep holding through the power-off slider and the Apple logo.', ['home', key], APL], ['Recovery screen', SHOW, [], REC]];
GR.push(
  { n: 'iPad with Home button', k: 'padhome', h: ['home', 'top'], m: 'iPad (1st to 9th gen), iPad Air 1 to 3, iPad mini 1 to 5, iPad Pro 9.7", 10.5" and 12.9" (1st and 2nd gen)', s: HOMEs('Top', 'top') },
  { n: 'iPad without Home button', k: 'padface', h: ['up', 'down', 'top'], m: 'iPad Pro 11" and 12.9" (3rd gen and newer), iPad Air 4 and newer, iPad mini 6 and newer, iPad (10th gen and newer)', s: FACEs('Top', 'top') },
  { n: 'iPod touch', k: 'top', h: ['home', 'top'], m: 'iPod touch (5th, 6th and 7th generation)', s: HOMEs('Top', 'top') }
);
const DFU_END = ['Check the screen', 'The screen must stay completely black, and Open should show “DFU Mode”. If the Apple logo appears you held too long: start again.', [], 'BLACK'];
const DFU_FACE = (btn, key) => [['Connect the device', PREP, ['cable'], ''], ['Press Volume Up', 'Press and quickly release Volume Up.', ['up'], ''], ['Press Volume Down', 'Press and quickly release Volume Down.', ['down'], ''], ['Hold the ' + btn + ' button', 'Hold the ' + btn + ' button for about 10 seconds, until the screen goes black.', [key], 'BLACK'], ['Add Volume Down', 'Keep holding ' + btn + ' and also hold Volume Down for 5 seconds.', [key, 'down'], 'BLACK'], ['Release ' + btn, 'Let go of the ' + btn + ' button but keep holding Volume Down for another 10 seconds.', ['down'], 'BLACK'], DFU_END];
const DFU_7 = [['Connect the device', PREP, ['cable'], ''], ['Hold two buttons', 'Hold the Side button and Volume Down together for 8 seconds.', ['side', 'down'], ''], ['Release Side', 'Let go of the Side button but keep holding Volume Down for another 5 seconds.', ['down'], 'BLACK'], DFU_END];
const DFU_HOME = (btn, key) => [['Connect the device', PREP, ['cable'], ''], ['Hold two buttons', 'Hold the Home button and the ' + btn + ' button together for 8 seconds.', ['home', key], ''], ['Release ' + btn, 'Let go of the ' + btn + ' button but keep holding Home for another 5 seconds.', ['home'], 'BLACK'], DFU_END];
const DFU_BY = [DFU_FACE('Side', 'side'), DFU_FACE('Side', 'side'), DFU_FACE('Side', 'side'), DFU_7, DFU_HOME('Side', 'side'), DFU_HOME('Top', 'top'), DFU_HOME('Top', 'top'), DFU_HOME('Top', 'top'), DFU_FACE('Top', 'top'), DFU_HOME('Top', 'top')];
GR.forEach((g, i) => { g.rec = g.s; g.dfu = DFU_BY[i]; Object.defineProperty(g, 's', { get() { return S.dfu ? g.dfu : g.rec; }, configurable: true }); });

groupFor = function (p) {
  p = String(p || '');
  let m = /^iPad(\d+),(\d+)$/.exec(p);
  if (m) return +m[1] === 8 || +m[1] >= 13 ? 8 : 7;
  if (/^iPod/.test(p)) return 9;
  m = /^iPhone(\d+),(\d+)$/.exec(p);
  if (!m) return -1;
  const a = +m[1], b = +m[2];
  if (a >= 18) return 0; if (a === 17) return b === 5 ? 1 : 0; if (a >= 15) return 0;
  if (a === 14) return b === 6 ? 2 : 1; if (a === 13) return 1; if (a === 12) return b === 8 ? 2 : 1; if (a === 11) return 1;
  if (a === 10) return b === 3 || b === 6 ? 1 : 2; if (a === 9) return 3; if (a === 8) return b === 4 ? 5 : 4; if (a === 7) return 4;
  return a >= 3 ? 5 : 6;
};

function padArt(kind, hl, scr, w) {
  const home = kind === 'padhome', on = k => hl.includes(k), c = k => on(k) ? '#FF8A57' : '#4b3f86', g = k => on(k) ? ' filter="url(#gl)"' : '',
    fill = scr === 'BLACK' ? '#000' : 'url(#sc)',
    B = (k, x, y, bw, bh) => `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${c(k)}"${g(k)}/>`,
    T = (k, x, y, t, a) => on(k) ? `<text x="${x}" y="${y}" text-anchor="${a}" font-size="11" font-weight="700" fill="#FF8A57">${t}</text>` : '';
  const screen = home
    ? `<rect x="66" y="86" width="168" height="206" rx="3" fill="${fill}"/><circle cx="150" cy="310" r="11" fill="none" stroke="${c('home')}" stroke-width="3"${g('home')}/>`
    : `<rect x="66" y="74" width="168" height="244" rx="10" fill="${fill}"/>`;
  return `<svg viewBox="0 0 300 396" width="${w}" style="max-width:100%"><defs><filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="sc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1566"/><stop offset="1" stop-color="#120a33"/></linearGradient></defs>${B('top', 180, 58, 40, 6)}${B('up', 248, 100, 6, 28)}${B('down', 248, 134, 6, 28)}<rect x="138" y="328" width="24" height="9" rx="2" fill="${c('cable')}"${g('cable')}/><rect x="56" y="64" width="188" height="264" rx="${home ? 18 : 16}" fill="#120b2e" stroke="#6a5aa8" stroke-width="3"/>${screen}<g text-anchor="middle" fill="#F6F3FF" font-family="Manrope,sans-serif">${scr === 'BLACK' ? '' : scr}</g>${T('up', 262, 118, 'Volume Up', 'start')}${T('down', 262, 152, 'Volume Down', 'start')}${T('top', 200, 50, 'Top button', 'middle')}${T('home', 170, 314, 'Home', 'start')}${T('cable', 150, 356, 'USB cable', 'middle')}</svg>`;
}
phoneArt = function (kind, hl = [], scr = '', w = 190) {
  if (kind.indexOf('pad') === 0) return padArt(kind, hl, scr, w);
  const face = kind === 'island' || kind === 'notch', tb = kind === 'top' || kind === 'old', on = k => hl.includes(k),
    c = k => on(k) ? '#FF8A57' : '#4b3f86', g = k => on(k) ? ' filter="url(#gl)"' : '', fill = scr === 'BLACK' ? '#000' : 'url(#sc)',
    B = (k, x, y, bw, bh) => `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${c(k)}"${g(k)}/>`,
    T = (k, x, y, t, a) => on(k) ? `<text x="${x}" y="${y}" text-anchor="${a}" font-size="11" font-weight="700" fill="#FF8A57">${t}</text>` : '';
  const body = `<rect x="84" y="30" width="132" height="332" rx="${face ? 30 : kind === 'old' ? 20 : 24}" fill="#120b2e" stroke="#6a5aa8" stroke-width="3"/>`;
  const sc = face
    ? `<rect x="92" y="38" width="116" height="316" rx="23" fill="${fill}"/>` + (kind === 'island' ? '<rect x="128" y="46" width="44" height="12" rx="6" fill="#05080f"/>' : '<path d="M118 38h64v6a8 8 0 01-8 8h-48a8 8 0 01-8-8z" fill="#05080f"/>')
    : `<rect x="92" y="80" width="116" height="222" rx="3" fill="${fill}"/><rect x="130" y="58" width="40" height="5" rx="2.5" fill="#43397a"/><circle cx="150" cy="332" r="16" fill="none" stroke="${c('home')}" stroke-width="3"${g('home')}/>`;
  const btns = (kind === 'old' ? '' : B('mute', 78, 86, 6, 18) + B('up', 78, 116, 6, 34) + B('down', 78, 158, 6, 34)) +
    (tb ? B('top', 150, 24, 46, 6) : B('side', 216, kind === 'six' ? 112 : 130, 6, kind === 'six' ? 46 : 62)) +
    `<rect x="138" y="362" width="24" height="10" rx="2" fill="${c('cable')}"${g('cable')}/>`;
  const lab = T('up', 72, 137, 'Volume Up', 'end') + T('down', 72, 179, 'Volume Down', 'end') + T('side', 230, 165, 'Side button', 'start') + T('top', 173, 18, 'Top button', 'middle') + T('home', 176, 336, 'Home', 'start') + T('cable', 150, 390, 'USB cable', 'middle');
  return `<svg viewBox="0 0 300 396" width="${w}" style="max-width:100%"><defs><filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="sc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1566"/><stop offset="1" stop-color="#120a33"/></linearGradient></defs>${btns}${body}${sc}<g text-anchor="middle" fill="#F6F3FF" font-family="Manrope,sans-serif">${scr === 'BLACK' ? '' : scr}</g>${lab}</svg>`;
};

P.enter = () => {
  const g = GR[S.rg], st = g.s[Math.min(S.rs, g.s.length - 1)], last = S.rs >= g.s.length - 1, label = S.dfu ? 'DFU Mode' : 'Recovery Mode';
  return `<div class="fade"><h1>Enter ${label}</h1>
<div class="tabs" role="tablist" aria-label="Mode"><button role="tab" aria-selected="${!S.dfu}" class="${S.dfu ? '' : 'on'}" data-act="mode:rec">Recovery Mode</button><button role="tab" aria-selected="${S.dfu}" class="${S.dfu ? 'on' : ''}" data-act="mode:dfu">DFU Mode</button></div>
<p class="mut">${S.dfu ? 'DFU Mode is a deeper restore state for when Recovery Mode cannot fix the problem. The screen stays completely black.' : (S.dev && S.dev.product && groupFor(S.dev.product) === S.rg ? 'Selected automatically from the connected device.' : 'Pick your device type. Not sure? Open Settings, General, About. If it will not turn on: no Home button means Face ID (Dynamic Island or notch); a round Home button means iPhone 8 or older.')}</p>
<div class="tabs">${GR.map((x, i) => `<button class="${i === S.rg ? 'on' : ''}" data-act="rg:${i}">${x.n}</button>`).join('')}</div>
<p class="mut" style="font-size:14px"><b>Models:</b> ${g.m}</p>
<div class="card hero"><div style="text-align:center">${phoneArt(g.k, st[2], st[3])}</div><div><span class="pill">Step ${S.rs + 1} of ${g.s.length}</span><div class="steps">${g.s.map((_, i) => `<span class="${i <= S.rs ? 'on' : ''}"></span>`).join('')}</div><h2>${st[0]}</h2><p>${st[1]}</p>
<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((S.rs + 1) / g.s.length * 100)}"><b style="width:${(S.rs + 1) / g.s.length * 100}%"></b></div><div class="row" style="margin-top:18px"><button class="btn sec" data-act="prev" ${S.rs ? '' : 'disabled'}>Previous Step</button><button class="btn" data-act="next">${last ? 'Finish' : 'Next Step'}</button><button class="btn sec" data-act="cancel">Cancel</button>${window.native && !S.dfu ? '<button class="btn sec" data-act="autoenter">Enter automatically</button>' : ''}</div>
<p class="mut" style="font-size:14px">Do not release early. ${S.dfu ? 'In DFU Mode the screen stays black; an Apple logo means start again.' : 'If the passcode screen or normal iOS appears, turn the device off and start again. A completely black screen is DFU Mode, not Recovery Mode. Automatic entry only works on an unlocked, trusted device.'}</p></div></div>
<h2 style="margin-top:24px">All device types</h2><div class="grid g3">${GR.map((x, i) => `<div class="card" style="text-align:center;cursor:pointer" data-act="rg:${i}">${phoneArt(x.k, x.h, '', 110)}<h2 style="font-size:16px">${x.n}</h2><p class="mut" style="font-size:14px">${x.m}</p></div>`).join('')}</div></div>`;
};

// device identity, firmware and multi-device scanning
const fmtUdid = s => /^[0-9A-Fa-f]{24}$/.test(s) ? s.slice(0, 8) + '-' + s.slice(8) : s;
const kvParse = t => Object.fromEntries((t || '').split('\n').map(l => l.match(/^\s*([\w-]+):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/[<>&"'`]/g, '')]));
const plistInt = (t, k) => { const m = new RegExp('<key>' + k + '</key>\\s*<integer>(\\d+)</integer>').exec(t || ''); return m ? +m[1] : null; };
async function getDB() {
  if (DB) return DB;
  const c = store.get('devdb', null);
  if (c && Date.now() - c.at < 864e5) { DB = c.list; return DB; }
  try {
    const list = (await api('https://api.ipsw.me/v4/devices')).map(x => ({ identifier: x.identifier, name: x.name, cpid: x.cpid, bdid: x.bdid }));
    store.set('devdb', { at: Date.now(), list }); DB = list; return DB;
  } catch (e) { if (c) { DB = c.list; return DB; } throw e; }
}
enrich = async function (o) {
  const n = window.native;
  if (n) {
    try {
      if (o.mode === 'Normal Mode') {
        o.udid = fmtUdid(o.handle.serialNumber || '');
        const u = ['-u', o.udid];
        let r = await n.run('ideviceinfo', u);
        if (!r.ok && !r.missing) r = await n.run('ideviceinfo', []);
        if (r.ok) {
          const k = kvParse(r.out);
          Object.assign(o, { product: k.ProductType, serial: k.SerialNumber, activation: k.ActivationState, passcode: k.PasswordProtected, build: k.BuildVersion, imei: k.InternationalMobileEquipmentIdentity, modelNumber: k.ModelNumber, region: k.RegionInfo, color: k.DeviceColor });
          if (k.UniqueDeviceID) o.udid = k.UniqueDeviceID;
          if (k.ProductVersion) o.ios = 'iOS ' + k.ProductVersion;
        }
        const b = /BatteryCurrentCapacity:\s*(\d+)/.exec((await n.run('ideviceinfo', [...u, '-q', 'com.apple.mobile.battery'])).out || '');
        if (b) o.battery = +b[1];
        const d = kvParse((await n.run('ideviceinfo', [...u, '-q', 'com.apple.disk_usage'])).out);
        if (d.TotalDiskCapacity) o.storage = { total: +d.TotalDiskCapacity, free: +d.TotalDataAvailable || 0 };
        const g = (await n.run('idevicediagnostics', [...u, 'ioregentry', 'AppleSmartBattery'])).out;
        const design = plistInt(g, 'DesignCapacity'), max = plistInt(g, 'NominalChargeCapacity') || plistInt(g, 'AppleRawMaxCapacity'), cycles = plistInt(g, 'CycleCount');
        if (design && max) o.health = Math.min(100, Math.round(max / design * 100));
        if (cycles !== null) o.cycles = cycles;
      } else if (o.ecid) {
        const r = await n.run('irecovery', ['-i', '0x' + o.ecid.replace(/^0x/i, ''), '-q']);
        if (r.ok) { const k = kvParse(r.out); o.product = k.PRODUCT || o.product; o.board = k.MODEL; }
      }
    } catch (e) { logEvt('identify: ' + e.message); }
  }
  try {
    const db = await getDB();
    const m = db.find(x => x.identifier === o.product) || (o.cpid && db.find(x => /^(iPhone|iPad|iPod)/.test(x.identifier) && x.cpid == parseInt(o.cpid, 16) && x.bdid == parseInt(o.bdid, 16)));
    if (m) { o.model = String(m.name).replace(/[<>&"'`]/g, ''); o.product = String(m.identifier).replace(/[^\w,]/g, ''); }
  } catch (e) { /* offline and nothing saved: keep the chip name */ }
  if (o.product && /^Apple device/.test(o.model)) o.model = o.product;
  return o;
};
Engine.firmware = async function (p) {
  const key = 'fw:' + p, clean = (v, re) => String(v == null ? '' : v).replace(re, '');
  let list;
  try {
    const j = await api('https://api.ipsw.me/v4/device/' + encodeURIComponent(p) + '?type=ipsw');
    list = (j.firmwares || []).filter(f => f.signed && /^https:\/\//.test(f.url)).map(x => ({ version: clean(x.version, /[^\w. -]/g), buildid: clean(x.buildid, /\W/g), filesize: +x.filesize || 0, url: x.url, sha1: /^[0-9a-f]{40}$/i.test(x.sha1sum || '') ? x.sha1sum : '' }));
    store.set(key, { at: Date.now(), list });
  } catch (e) {
    const c = store.get(key, null);
    if (!c) throw e;
    list = c.list.map(x => ({ ...x, cached: true }));
  }
  return list[0] || null;
};
Engine.exitRecovery = async function () {
  const d = S.dev && S.dev.handle;
  if (!d) throw new Error('No device connected.');
  if (S.dev.mode === 'DFU Mode') throw new Error('DFU Mode has no software exit command. Hold Volume Up, Volume Down, then the Side button until the Apple logo appears, or hold the buttons for about 10 seconds to restart.');
  if (S.dev.mode !== 'Recovery Mode') throw new Error('The device is not in Recovery Mode.');
  const gone = new Promise(r => { const f = e => { if (e.device === d) { navigator.usb.removeEventListener('disconnect', f); r(true); } }; navigator.usb.addEventListener('disconnect', f); setTimeout(() => r(false), 15000); });
  let err = '', viaTool = false;
  try {
    if (window.native) {
      const ec = S.dev.ecid ? ['-i', '0x' + S.dev.ecid.replace(/^0x/i, '')] : [];
      const r = await native.run('irecovery', [...ec, '-n']);
      viaTool = !r.missing; if (viaTool && !r.ok) err = r.out;
    }
    if (!viaTool) { await d.open(); if (d.configuration === null) await d.selectConfiguration(1); await d.claimInterface(0); await Engine.cmd(d, 'setenv auto-boot true'); await Engine.cmd(d, 'saveenv'); await Engine.cmd(d, 'reboot'); }
  } catch (e) { err = e.message; }
  if (!(await gone)) throw new Error('The device did not leave Recovery Mode. ' + (err || 'Commands were sent but no reboot was observed.') + ' On Windows the Apple driver may block WebUSB; try another port or a force restart.');
  return true;
};

const CACHE = new Map();
let scanning = false, lastSig = '';
const devKey = d => (d.serialNumber || '') + ':' + d.productId;
async function scanAll() {
  if (!navigator.usb || scanning) return;
  scanning = true;
  try {
    let list;
    try { list = (await navigator.usb.getDevices()).filter(x => x.vendorId === 0x05ac); } catch (e) { return; }
    const out = [];
    for (const d of list) {
      let o = CACHE.get(devKey(d));
      if (!o) {
        try { o = await Engine.detect(d); CACHE.set(devKey(d), o); toast('Device detected: ' + o.model + ' · ' + o.mode); logEvt('detected ' + o.model + ' ' + o.mode); } catch (e) { continue; }
      }
      o.handle = d; out.push(o);
    }
    for (const k of [...CACHE.keys()]) if (!list.some(d => devKey(d) === k)) CACHE.delete(k);
    S.devs = out;
    if (!S.dev || !out.includes(S.dev)) S.dev = out[0] || null;
    const sig = out.map(o => (o.serial || o.ecid || o.udid || '') + o.mode).join('|') + (S.dev ? '*' + (S.dev.serial || S.dev.ecid || '') : '');
    if (sig !== lastSig) { lastSig = sig; render(); }
  } finally { scanning = false; }
}
autoDetect = scanAll;

// jobs, reports, review prompt
const REPAIRS = new Set(['Exit Recovery Mode', 'Update iOS', 'Erase & Restore', 'Enter Recovery Mode']);
function logJob(action, ok, note, dev) {
  const d = dev || S.dev || {}, jobs = store.get('jobs', []);
  jobs.unshift({ id: Date.now(), at: new Date().toISOString(), customer: S.customer || '', model: d.model || '', serial: d.serial || '', udid: d.udid || '', mode: d.mode || '', action, ok: !!ok, note: String(note || '').slice(0, 300) });
  store.set('jobs', jobs.slice(0, 500));
  logEvt(action + ': ' + (ok ? 'ok' : 'failed'));
  if (ok && REPAIRS.has(action)) maybeAskReview();
}
function maybeAskReview() {
  if (store.get('reviewAsked', false) || store.get('jobs', []).filter(j => j.ok && REPAIRS.has(j.action)).length < 3) return;
  store.set('reviewAsked', true);
  setTimeout(() => modal(`<h2>Did Open help?</h2><p class="mut">Honest feedback helps us improve and helps others decide. How would you rate it?</p><div class="row" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map(i => `<button class="btn sec" data-act="rate:${i}" aria-label="${i} star${i > 1 ? 's' : ''}">${'★'.repeat(i)}</button>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn sec" data-act="mx2">Maybe later</button></div>`), 700);
}
function reportHtml(o) {
  const sh = SHOP(), row = ([a, b]) => `<tr><th>${h(a)}</th><td>${h(b || '—')}</td></tr>`, d = o.device;
  const dev = d ? [['Model', d.model], ['Product type', d.product], ['Serial number', d.serial], ['IMEI', d.imei], ['iOS', d.ios], ['Mode', d.mode], ['Battery', d.battery != null ? d.battery + '%' : ''], ['Battery health', d.health != null ? d.health + '% (' + (d.cycles != null ? d.cycles + ' cycles' : 'cycles n/a') + ')' : ''], ['Storage', d.storage ? (d.storage.free / 1e9).toFixed(1) + ' GB free of ' + (d.storage.total / 1e9).toFixed(0) + ' GB' : '']] : [];
  const diag = (o.diag || []).map(x => `<tr><td>${{ pass: '✔', warn: '⚠', fail: '✘' }[x.s]}</td><td><b>${h(x.t)}</b><br>${h(x.d)}</td></tr>`).join('');
  const jobs = (o.jobs || []).map(j => `<tr><td>${h(j.at.slice(0, 10))}</td><td>${h(j.action)}</td><td>${j.ok ? 'Done' : 'Failed'}</td><td>${h(j.note)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Repair report</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:34px;font-size:14px}h1{margin:0;color:#5E17EB;font-size:24px}h2{border-bottom:2px solid #5E17EB;padding-bottom:4px;margin-top:24px;font-size:15px}table{width:100%;border-collapse:collapse}th{text-align:left;width:32%;color:#555;font-weight:600}td,th{padding:5px 4px;border-bottom:1px solid #ddd;vertical-align:top}.f{margin-top:40px;color:#666;font-size:11px}</style></head><body>
<h1>${h(sh.name || 'Repair report')}</h1><div>${h([sh.phone, sh.address].filter(Boolean).join(' · '))}</div><div>Date: ${h(new Date().toISOString().slice(0, 10))}</div>
<h2>Customer</h2><table>${row(['Name or phone', o.customer])}</table>${d ? '<h2>Device</h2><table>' + dev.map(row).join('') + '</table>' : ''}
${diag ? '<h2>Diagnostics</h2><table>' + diag + '</table>' : ''}${jobs ? '<h2>Work performed</h2><table>' + jobs + '</table>' : ''}
<div style="margin-top:50px;display:flex;gap:60px"><div style="flex:1;border-top:1px solid #111;padding-top:4px">Technician</div><div style="flex:1;border-top:1px solid #111;padding-top:4px">Customer</div></div>
<div class="f">Prepared with Open. iPhone, iPad and iOS are trademarks of Apple Inc. Open is not affiliated with Apple Inc.</div></body></html>`;
}
async function exportPdf(customerOnly) {
  if (!window.native) return toast('PDF reports are available in the desktop app.');
  const d = customerOnly ? null : S.dev, all = store.get('jobs', []);
  const jobs = customerOnly ? all.filter(j => j.customer === S.customer) : all.filter(j => d && ((j.serial && j.serial === d.serial) || (j.udid && j.udid === d.udid)));
  const r = await native.savePdf(reportHtml({ customer: S.customer, device: d, diag: d ? S.lastDiag : null, jobs: jobs.slice(0, 40).reverse() }), 'repair-report-' + new Date().toISOString().slice(0, 10));
  toast(r.ok ? 'Report saved.' : r.canceled ? 'Cancelled.' : 'Could not create the PDF.');
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
function exportCsv() {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  download('open-jobs.csv', ['Date,Customer,Model,Serial,Action,Result,Note', ...store.get('jobs', []).map(j => [j.at, j.customer, j.model, j.serial, j.action, j.ok ? 'Done' : 'Failed', j.note].map(q).join(','))].join('\n'), 'text/csv');
}
P.jobs = () => {
  const q = (S.jq || '').toLowerCase(), rows = store.get('jobs', []).filter(j => !q || JSON.stringify(j).toLowerCase().includes(q));
  return `<div class="fade"><h1>Jobs & Reports</h1><p class="mut">Customer history, CSV export and PDF reports. Everything stays on this computer.</p>
<div class="card" style="margin-bottom:16px"><label for="cust"><b>Current customer</b></label><div class="row" style="margin-top:8px"><input id="cust" class="sw" data-bind="customer" value="${h(S.customer)}" placeholder="Name or phone" style="flex:1;min-width:220px"><button class="btn sec" data-act="jobnote">Add note</button><button class="btn sec" data-act="pdfcust">PDF for customer</button><button class="btn sec" data-act="csv">Export CSV</button><button class="btn sec" data-act="jobclear">Clear all</button></div></div>
<div class="row" style="margin-bottom:12px"><label for="jq" class="mut">Search</label><input id="jq" class="sw" data-bind="jq" value="${h(S.jq)}" placeholder="Customer, model, action" style="flex:1;min-width:220px"></div>
<div class="card" style="overflow-x:auto">${rows.length ? `<table class="jt"><tr><th>Date</th><th>Customer</th><th>Device</th><th>Action</th><th>Result</th><th>Note</th></tr>${rows.slice(0, 200).map(j => `<tr><td>${h(j.at.slice(0, 10))}</td><td>${h(j.customer)}</td><td>${h(j.model)}</td><td>${h(j.action)}</td><td>${j.ok ? '✔ Done' : '✘ Failed'}</td><td>${h(j.note)}</td></tr>`).join('')}</table>` : '<p class="mut">No jobs yet. Repairs are recorded here automatically.</p>'}</div></div>`;
};
const shopHtml = () => { const s = SHOP(); return `<div class="set" style="display:block"><div><b>Shop details for reports</b><div class="mut">Printed on PDF reports. Stored only on this computer.</div></div><div class="row" style="margin-top:10px"><input class="sw" aria-label="Shop name" data-bind="shop.name" value="${h(s.name)}" placeholder="Shop name"><input class="sw" aria-label="Shop phone" data-bind="shop.phone" value="${h(s.phone)}" placeholder="Phone"><input class="sw" aria-label="Shop address" data-bind="shop.address" value="${h(s.address)}" placeholder="Address"></div></div>`; };
const _settings = P.settings;
P.settings = () => _settings().replace('<div class="set"><div><b>Updates</b>', shopHtml() + '<div class="set"><div><b>Updates</b>');

// diagnostics, firmware download, backup and restore
repGo = async function (i) {
  if (![...document.querySelectorAll('.chk')].every(c => c.checked)) return toast('Please confirm every checklist item.');
  modal('<div class="spin"></div><p style="text-align:center">Running advanced diagnostics…</p>');
  const L = [], add = (s, t, d = '') => L.push({ s, t, d }), d = S.dev; let fw = null;
  add(navigator.usb ? 'pass' : 'warn', 'USB subsystem', navigator.usb ? 'WebUSB available' : 'WebUSB unavailable');
  if (window.native) { for (const t of ['idevice_id', 'ideviceinfo', 'irecovery', 'idevicerestore', 'idevicebackup2', 'idevicediagnostics']) { const r = await native.run(t, ['--version']); add(r.missing ? 'fail' : 'pass', 'Tool ' + t, r.missing ? 'Missing from this installation' : 'Installed'); } }
  else add('warn', 'Device tools', 'Desktop app required for restore and backup');
  add(navigator.onLine ? 'pass' : 'warn', 'Internet', navigator.onLine ? 'Connected' : 'Offline: saved firmware and device lists will be used');
  if (S.devs.length > 1) add('warn', 'Several devices', 'Disconnect the others before restoring');
  if (!d) add('fail', 'Device', 'No device detected. Connect by USB and unlock it.');
  else {
    add('pass', 'Device', d.model + ' · ' + d.mode);
    add(d.mode === 'Normal Mode' ? 'pass' : 'warn', 'Operating mode', d.mode === 'Normal Mode' ? 'iOS is running' : 'Device is outside iOS (' + d.mode + ')');
    add(d.ecid ? 'pass' : 'warn', 'Identity', (d.ecid ? 'ECID ' + d.ecid : 'ECID unavailable') + (d.chip ? ' · chip ' + d.chip : '') + (d.product ? ' · ' + d.product : ''));
    if (d.mode === 'Normal Mode') {
      add(d.activation === 'Activated' ? 'pass' : 'warn', 'Activation', d.activation || 'Unknown');
      add(d.passcode === 'true' ? 'warn' : 'pass', 'Passcode', d.passcode === 'true' ? 'Enabled; it may be needed during repair' : 'Not set');
      if (d.battery != null) add(d.battery < 20 ? 'fail' : d.battery < 40 ? 'warn' : 'pass', 'Battery charge', d.battery + '%' + (d.battery < 40 ? '. Charge above 40% before restoring' : ''));
      if (d.health != null) add(d.health < 80 ? 'warn' : 'pass', 'Battery health', d.health + '% of design capacity' + (d.cycles != null ? ', ' + d.cycles + ' cycles' : '') + (d.health < 80 ? '. Battery service recommended' : ''));
      else add('warn', 'Battery health', 'Not available on this iOS version');
      if (d.storage) { const pct = Math.round(d.storage.free / d.storage.total * 100); add(pct < 10 ? 'warn' : 'pass', 'Storage', (d.storage.free / 1e9).toFixed(1) + ' GB free of ' + (d.storage.total / 1e9).toFixed(0) + ' GB' + (pct < 10 ? '. Updates may fail when storage is almost full' : '')); }
    }
    if (d.product) {
      try {
        fw = await Engine.firmware(d.product); S.fw = fw; S.fwProduct = d.product;
        add(fw ? 'pass' : 'fail', 'Signed firmware', fw ? 'iOS ' + fw.version + ' (' + fw.buildid + ', ' + (fw.filesize / 1e9).toFixed(1) + ' GB)' + (fw.cached ? ' · saved copy, may be outdated' : '') : 'None currently signed');
        if (fw && d.ios && d.ios.indexOf('iOS') === 0 && !d.ios.includes(fw.version)) add('warn', 'Software version', d.ios + '. Latest signed is ' + fw.version);
      } catch (e) { add('warn', 'Signed firmware', 'Lookup failed and nothing is saved: ' + e.message); }
    } else add('warn', 'Signed firmware', 'Product type unknown');
  }
  S.lastDiag = L; S.lastDiagText = L.map(x => '[' + x.s.toUpperCase() + '] ' + x.t + ': ' + x.d).join('\n');
  REPORT = 'Open diagnostic report · ' + REP[i][0] + ' · ' + new Date().toISOString() + '\n' + S.lastDiagText;
  const bad = L.filter(x => x.s === 'fail').length, wr = L.filter(x => x.s === 'warn').length, rec = d && d.mode === 'Recovery Mode', sym = { pass: '✔', warn: '⚠', fail: '✘' };
  logJob('Diagnostics', !bad, bad + ' issue(s), ' + wr + ' warning(s)', d);
  modal(`<h2>${REP[i][0]}: diagnostics</h2><p class="mut">${bad ? bad + ' blocking issue(s)' : 'No blocking issues'} · ${wr} warning(s)</p><table>${L.map(x => `<tr><td style="width:30px">${sym[x.s]}</td><td><b>${h(x.t)}</b><br><span class="mut">${h(x.d)}</span></td></tr>`).join('')}</table><div class="row" style="margin-top:14px">${window.native && fw && !bad ? '<button class="btn" data-act="install:0">Update iOS (keeps data)</button><button class="btn dng" data-act="install:1">Erase &amp; Restore</button>' : ''}${rec ? '<button class="btn" data-act="go:exit">Exit Recovery Mode</button>' : ''}<button class="btn sec" data-act="report">Export report</button><button class="btn sec" data-act="pdf">PDF report</button><button class="btn sec" data-act="mx2">Close</button></div>`);
};
result = function (ok, okT, failT, out, more = '') {
  modal(`<h2>${ok ? okT : failT}</h2><pre style="white-space:pre-wrap;max-height:200px;overflow:auto" class="mut">${esc((out || '').slice(-900))}</pre>${ok ? '' : explain(out)}<div class="row">${more}<button class="btn sec" data-act="mx2">Close</button>${ok ? '' : '<button class="btn sec" data-act="supmodal">Send details to support</button>'}</div>`);
};
async function getFirmware(fw, product) {
  modal(`<h2>Downloading iOS ${h(fw.version)}</h2><p id="fp" class="mut">Starting…</p><div class="bar" id="fbar" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><b id="fb" style="width:2%"></b></div><p class="mut" style="font-size:14px">The file is checked against Apple’s checksum. If the connection drops, run it again and it resumes.</p><div class="row"><button class="btn sec" data-act="fwcancel">Cancel</button></div>`);
  native.onFwProgress(p => { const b = $('#fb'), l = $('#fp'); if (!b || !p.total) return; const pc = Math.round(p.got / p.total * 100); b.style.width = pc + '%'; $('#fbar').setAttribute('aria-valuenow', pc); l.textContent = pc + '% · ' + (p.got / 1e9).toFixed(2) + ' of ' + (p.total / 1e9).toFixed(2) + ' GB'; });
  const r = await native.fwDownload({ url: fw.url, sha1: fw.sha1, size: fw.filesize, name: product + '_' + fw.version + '_' + fw.buildid + '.ipsw' });
  if (!r.ok) { logEvt('firmware: ' + r.message); result(false, '', 'Download failed', r.message); return null; }
  return r.path;
}
doRestore = async function (erase) {
  if (erase && !confirm('This will ERASE ALL DATA on the device. Continue?')) return;
  if (S.devs.length > 1) return modal('<h2>Disconnect other devices</h2><p class="mut">Restores run on one device at a time. Disconnect the other devices and try again.</p><button class="btn" data-act="mx2">OK</button>');
  const d = S.dev, args = erase ? ['-e'] : []; let fw = null;
  if (d && d.product) {
    try { fw = S.fw && S.fwProduct === d.product ? S.fw : await Engine.firmware(d.product); }
    catch (e) { return result(false, '', 'Cannot find the firmware', 'No internet and no saved firmware list. Connect to the internet once, or retry later.'); }
  }
  if (fw) { const path = await getFirmware(fw, d.product); if (!path) return; args.push(path); } else args.push('-l');
  const action = erase ? 'Erase & Restore' : 'Update iOS';
  const r = await live(erase ? 'Erase & Restore' : 'Updating iOS', 'idevicerestore', args);
  logJob(action, r.ok, (r.out || '').slice(-200), d);
  result(r.ok, 'Finished', 'Installation failed', r.out);
};
backup = async function () {
  const dir = await native.pickDir();
  if (!dir) return;
  const d = S.dev, r = await live('Backing up the device', 'idevicebackup2', d && d.udid ? ['-u', d.udid, 'backup', dir] : ['backup', dir]);
  logJob('Backup', r.ok, (r.out || '').slice(-200), d);
  result(r.ok, 'Backup complete', 'Backup failed', r.out, r.ok ? '<button class="btn dng" data-act="rs:1">Continue to erase</button>' : '');
};
autoEnter = async function () {
  modal('<div class="spin"></div><p style="text-align:center">Requesting Recovery Mode…</p>');
  let u = S.dev && S.dev.mode === 'Normal Mode' ? S.dev.udid : '';
  if (!u) { const l = await native.run('idevice_id', ['-l']); u = (l.out || '').split(/\s+/)[0]; if (!l.ok || !u) return modal(`<h2>No device found</h2><p class="mut">${l.missing ? 'Device tools are missing from this installation.' : 'Connect and unlock the device, then tap Trust.'}</p><button class="btn" data-act="mx2">OK</button>`); }
  const r = await native.run('ideviceenterrecovery', [u]);
  logJob('Enter Recovery Mode', r.ok, r.out);
  modal(`<h2>${r.ok ? 'Request sent' : 'Request failed'}</h2><p class="mut">${h(r.out || 'The device will restart into Recovery Mode and be detected automatically.')}</p><button class="btn" data-act="mx2">OK</button>`);
};
const _exitRun = exitRun;
exitRun = async function () { const d = S.dev; await _exitRun(); logJob('Exit Recovery Mode', S.ex && S.ex.st === 'ok', S.ex && S.ex.msg, d); };

// what's wrong wizard
const SYMP = [
  ['logo', 'Stuck on the Apple logo', 'The logo stays on screen or iOS never finishes starting.'],
  ['rec', 'Stuck on “Connect to computer”', 'The device shows a cable and computer picture and will not start.'],
  ['loop', 'Keeps restarting (boot loop)', 'It restarts again and again, with or without the logo.'],
  ['locked', 'Disabled or forgot the passcode', '“iPhone Unavailable”, “Security Lockout” or a forgotten passcode.'],
  ['frozen', 'Frozen or unresponsive', 'The screen does not react to touch or buttons.'],
  ['update', 'Update failed or stuck', 'A software update will not finish or shows an error.'],
  ['charge', 'Will not charge or turn on', 'Black screen and no sign of life.'],
  ['beta', 'On an iOS beta', 'Want to leave the iOS beta and return to the public version.'],
  ['battery', 'Overheating or battery drains fast', 'Gets hot, loses charge quickly or shuts down early.']
];
const HW = { t: 'If it keeps failing, suspect hardware', d: 'Repeated failures on different cables and computers point to the battery, storage or board. A repair shop can test these.', keep: null, acts: [['Error code help', 'go:help']] };
function plan(id) {
  const det = !!S.dev, m = S.dev && S.dev.mode;
  const detect = det ? [] : [{ t: 'Connect and detect the device', d: 'Plug it in with a data cable. Windows needs Apple Devices installed. Open detects it automatically.', keep: null, acts: [['Open Home', 'go:home']] }];
  const force = { t: 'Force restart', d: 'Often enough on its own. Steps depend on the model.', keep: true, acts: [['Show steps', 'force']] };
  const exitRec = m === 'Recovery Mode' ? { t: 'Exit Recovery Mode', d: 'The device is in Recovery Mode right now. Try leaving it first.', keep: true, acts: [['Exit Recovery Mode', 'go:exit']] } : { t: 'Enter Recovery Mode', d: 'Recovery Mode lets Open update iOS without erasing data.', keep: true, acts: [['Enter Recovery Mode', 'go:enter']] };
  const update = { t: 'Update iOS (keeps data)', d: 'Reinstalls iOS over the top and keeps your data in most cases.', keep: true, acts: [['Start update', 'rep:0']] };
  const dfu = { t: 'Restore from DFU Mode', d: 'A deeper restore state when Recovery Mode is not enough.', keep: false, acts: [['DFU guide', 'dfuenter']] };
  const erase = { t: 'Erase & Restore (last resort)', d: 'Installs a clean iOS and deletes everything. Back up first if the device is unlocked.', keep: false, acts: [['Open repair', 'rep:4']] };
  const plans = {
    logo: [...detect, force, exitRec, update, erase, HW],
    rec: [...detect, exitRec, update, erase, HW],
    loop: [...detect, force, update, dfu, erase, HW],
    locked: [...detect, { t: 'Know the limits', d: 'A forgotten passcode cannot be bypassed. The only way back in is to erase the device, which deletes its data. If Find My was on, the original Apple ID is needed afterwards (Activation Lock).', keep: null, acts: [] }, { t: 'Enter Recovery Mode', d: 'Put the device into Recovery Mode by hand.', keep: null, acts: [['Show steps', 'go:enter']] }, erase],
    frozen: [...detect, force, update, erase],
    update: [...detect, { t: 'Check power and space', d: 'Keep it above 40% battery and make sure the computer has plenty of free disk space.', keep: null, acts: [] }, force, update, { t: 'Look up the error', d: 'If you saw an error number, find out what it usually means.', keep: null, acts: [['Error code help', 'go:help']] }, dfu],
    charge: [{ t: 'Check the basics', d: 'Try another cable and wall adapter, clean the port gently with a wooden or plastic pick, and charge for 30 minutes.', keep: null, acts: [] }, force, ...detect, { t: 'Does the computer see it?', d: 'If Open detects it, the port and board are alive and software repair can help. If nothing ever appears, the battery or charging port is the likely cause.', keep: null, acts: [['Open Home', 'go:home']] }, HW],
    beta: [{ t: 'Leave the beta without erasing', d: 'Turn beta updates off and install the next public release when it arrives.', keep: true, acts: [['Show steps', 'beta']] }, { t: 'Go back to the public iOS now', d: 'Erase & Restore installs the current public iOS but deletes everything. Backups made on a beta usually cannot be restored onto an older public iOS.', keep: false, acts: [['Open repair', 'rep:4']] }],
    battery: [{ t: 'Check battery health', d: 'Open reads battery health and charge cycles when the device is unlocked and running.', keep: null, acts: [['Open details', 'go:info']] }, update, { t: 'Reduce the load', d: 'Check Settings, Battery for apps using lots of power, lower screen brightness and turn off background refresh for heavy apps.', keep: null, acts: [] }, { t: 'Replace the battery if health is low', d: 'Below about 80% health, or shutting down at 20 to 40%, usually means the battery needs service.', keep: null, acts: [] }]
  };
  return plans[id] || [];
}
P.wizard = () => {
  const s = SYMP.find(x => x[0] === S.wz);
  const ctx = S.dev ? `Detected: <b>${h(S.dev.model)}</b> · ${h(S.dev.mode)}` : 'No device detected yet. Plans adapt when a device is connected.';
  if (!s) return `<div class="fade"><h1>What’s wrong?</h1><p class="mut">Pick the closest symptom. Open suggests the least destructive fix first.</p><p class="pill">${ctx}</p><div class="grid g3" style="margin-top:14px">${SYMP.map(x => `<div class="card" style="cursor:pointer" data-act="wz:${x[0]}"><h2 style="font-size:17px">${x[1]}</h2><p class="mut">${x[2]}</p></div>`).join('')}</div></div>`;
  return `<div class="fade"><h1>${s[1]}</h1><p class="mut">${s[2]}</p><p class="pill">${ctx}</p>${plan(s[0]).map((p, i) => `<div class="step"><b>${i + 1}</b><div class="card"><b>${h(p.t)}</b>${p.keep === true ? '<span class="badge keep">Keeps data</span>' : p.keep === false ? '<span class="badge erase">Erases data</span>' : ''}<p class="mut">${h(p.d)}</p>${p.acts.length ? '<div class="row">' + p.acts.map(a => `<button class="btn sec" data-act="${a[1]}">${a[0]}</button>`).join('') + '</div>' : ''}</div></div>`).join('')}<div class="row"><button class="btn sec" data-act="wzreset">Pick another symptom</button></div></div>`;
};
function forceHtml() {
  let g = S.dev && S.dev.product ? groupFor(S.dev.product) : -1; if (g < 0) g = S.rg;
  const steps = g <= 2 ? ['Press and quickly release Volume Up.', 'Press and quickly release Volume Down.', 'Press and hold the Side button until the Apple logo appears.']
    : g === 3 ? ['Hold the Side button and Volume Down together for about 10 seconds, until the Apple logo appears.']
    : g === 8 ? ['Press and quickly release Volume Up.', 'Press and quickly release Volume Down.', 'Press and hold the Top button until the Apple logo appears.']
    : ['Hold the Home button and the ' + (g === 4 ? 'Side' : 'Top') + ' button together until the Apple logo appears.'];
  return `<h2>Force restart</h2><p class="mut">${h(GR[g].n)}</p><ol class="mut">${steps.map(x => '<li>' + h(x) + '</li>').join('')}</ol><button class="btn" data-act="mx2">Got it</button>`;
}
const betaHtml = () => '<h2>Leave the iOS beta</h2><ol class="mut"><li>iOS 16.4 and later: Settings, General, Software Update, Beta Updates, Off. Older iOS: Settings, General, VPN & Device Management, iOS Beta Software Profile, Remove Profile, then restart.</li><li>When the next public release appears, install it from Settings, Software Update. Your data is kept.</li><li>To return to the current public iOS right now, use Erase & Restore. It deletes everything, and backups made on a beta usually cannot be restored onto an older public iOS.</li></ol><p class="mut" style="font-size:14px">Apple’s own steps can differ slightly between iOS versions.</p><button class="btn" data-act="mx2">Got it</button>';

// home, info, help and support
const _info = P.info;
P.info = () => {
  const d = S.dev, gb = b => b ? (b / 1e9).toFixed(1) + ' GB' : '—';
  const extra = d ? `<div class="card" style="max-width:640px;margin-top:16px"><h2>Details for repair shops</h2><table><tr><td>IMEI</td><td>${h(d.imei || '—')}</td></tr><tr><td>Model number</td><td>${h(d.modelNumber || '—')}</td></tr><tr><td>Region</td><td>${h(d.region || '—')}</td></tr><tr><td>Color</td><td>${h(d.color || '—')}</td></tr><tr><td>Battery charge</td><td>${d.battery != null ? d.battery + '%' : '—'}</td></tr><tr><td>Battery health</td><td>${d.health != null ? d.health + '% · ' + (d.cycles != null ? d.cycles + ' cycles' : '') : 'Not available'}</td></tr><tr><td>Storage</td><td>${d.storage ? gb(d.storage.free) + ' free of ' + gb(d.storage.total) : '—'}</td></tr></table><div class="row" style="margin-top:14px"><a class="btn sec" href="https://checkcoverage.apple.com/" target="_blank" rel="noopener" data-act="copyserial">Check warranty (copies serial)</a><button class="btn" data-act="pdf">Export PDF report</button></div><p class="mut" style="font-size:14px">Warranty status comes from Apple’s website using the serial number; Open cannot read it from the device. Battery health can be unavailable on some iOS versions.</p></div>` : '';
  return _info() + extra;
};
const _help = P.help;
P.help = () => _help() + `<div class="grid g2" style="margin-top:18px"><div class="card"><h2>Contact support</h2><p class="mut">We answer on WhatsApp and email. Sending details is always your choice.</p><div class="row"><a class="btn" href="${waLink('Hello 5FYN, I need help with Open ' + APP.version)}" target="_blank" rel="noopener">Chat on WhatsApp</a>${mailBtn('Open support', 'Hello, I need help with Open ' + APP.version)}<button class="btn sec" data-act="supmodal">Send details to support</button></div></div>
<div class="card"><h2>Error code lookup</h2><label for="ec" class="mut">Type an error number from Apple Devices, iTunes or Finder</label><input id="ec" class="sw" placeholder="For example 4013" style="width:100%;margin:8px 0"><div id="ecres">${lookupHtml('')}</div></div></div>
<div class="card" style="margin-top:18px"><details><summary>What’s new</summary>${ABOUT.changes.map(c => `<h3>${h(c.v)} <span class="mut" style="font-weight:400">${h(c.date)}</span></h3><ul class="mut">${c.items.map(x => '<li>' + h(x) + '</li>').join('')}</ul>`).join('')}</details><details><summary>What Open cannot do</summary><ul class="mut">${ABOUT.limits.map(x => '<li>' + h(x) + '</li>').join('')}</ul></details></div>`;
function supportReport(ids) {
  const d = S.dev, red = t => ids ? t : String(t).replace(/\b[0-9A-Fa-f-]{24,40}\b/g, '[id]');
  const dev = d ? [d.model, d.product, d.mode, d.ios].filter(Boolean).join(' · ') + (ids ? ' · serial ' + (d.serial || '-') + ' · udid ' + (d.udid || '-') + ' · ecid ' + (d.ecid || '-') : '') : 'No device';
  return red(['Open ' + APP.version + ' on ' + (window.native ? native.platform : 'web'), 'Device: ' + dev, 'Devices connected: ' + S.devs.length, 'Online: ' + navigator.onLine, 'Last diagnostics:', S.lastDiagText || '(none)', 'Recent events:', ...LOG.slice(-40)].join('\n'));
}
function supportModal(ids) {
  const rep = supportReport(ids), short = rep.slice(0, 1400);
  modal(`<h2>Send details to support</h2><p class="mut">Nothing is sent automatically. Review the report, then choose how to send it. Serial number, UDID and ECID are ${ids ? '<b>included</b>' : 'left out'}.</p><label class="mut"><input type="checkbox" data-act="supids" ${ids ? 'checked' : ''}> Include device identifiers</label><textarea class="sw" readonly aria-label="Report preview" style="margin-top:10px">${h(rep)}</textarea><div class="row" style="margin-top:12px"><a class="btn" href="${waLink('Open support request\n' + short)}" target="_blank" rel="noopener">WhatsApp</a>${mailBtn('Open support request', short)}<button class="btn sec" data-act="supcopy">Copy</button><button class="btn sec" data-act="supsave">Save file</button><button class="btn sec" data-act="mx2">Close</button></div><p class="mut" style="font-size:14px">Links carry the first part of the report. Use Copy or Save file to share all of it.</p>`);
  S.supIds = !!ids;
}

// accessibility, offline and events
modal = function (html) {
  $('#modal').innerHTML = `<div class="modal" data-act="mx"><div class="card fade" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  applyLang();
  const c = $('#modal .card'); if (c) (c.querySelector('button,a,input,textarea') || c).focus();
};
const _render = render;
render = function () {
  _render();
  const side = $('#side'); side.setAttribute('role', 'navigation'); side.setAttribute('aria-label', 'Main navigation');
  side.querySelectorAll('.nav').forEach(b => { b.removeAttribute('aria-current'); if (b.classList.contains('on')) b.setAttribute('aria-current', 'page'); });
  document.querySelectorAll('main div[data-act]').forEach(e => { if (!e.hasAttribute('role')) { e.setAttribute('role', 'button'); e.setAttribute('tabindex', '0'); } });
  document.querySelectorAll('main svg[viewBox="0 0 300 396"]').forEach(s => { s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Illustration of the device and the buttons to press'); });
  document.querySelectorAll('select[data-sel]').forEach(s => s.setAttribute('aria-label', s.dataset.sel === 'lang' ? 'Language' : 'Theme'));
  $('#eng').textContent = Engine.name + (navigator.onLine ? '' : ' · Offline mode');
  const ver = $('#ver'); if (ver) ver.textContent = 'v' + APP.version;
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal .modal[data-act="mx"]')) closeM();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
});
window.addEventListener('online', () => { render(); toast('Back online'); });
window.addEventListener('offline', () => { render(); toast('Offline mode: saved data will be used'); });

const ACT = {
  mode: v => { S.dfu = v === 'dfu'; S.rs = 0; render(); },
  wz: v => { S.wz = v; render(); },
  wzreset: () => { S.wz = null; render(); },
  selectdev: v => { S.dev = S.devs[+v] || S.dev; render(); },
  force: () => modal(forceHtml()),
  beta: () => modal(betaHtml()),
  dfuenter: () => { closeM(); S.dfu = true; S.rs = 0; go('enter'); },
  copyserial: () => { if (S.dev && S.dev.serial && navigator.clipboard) navigator.clipboard.writeText(S.dev.serial).then(() => toast('Serial number copied'), () => {}); },
  pdf: () => exportPdf(false),
  pdfcust: () => exportPdf(true),
  csv: exportCsv,
  jobnote: () => modal('<h2>Add a note</h2><label for="jn" class="mut">Note for the current customer and device</label><textarea id="jn" class="sw" style="margin:8px 0"></textarea><div class="row"><button class="btn" data-act="jobsave">Save</button><button class="btn sec" data-act="mx2">Cancel</button></div>'),
  jobsave: () => { const t = ($('#jn') || {}).value; if (t && t.trim()) logJob('Note', true, t.trim()); closeM(); render(); },
  jobclear: () => { if (confirm('Delete all saved jobs from this computer?')) { store.set('jobs', []); render(); } },
  supmodal: () => supportModal(false),
  supids: (v, el) => supportModal(el.checked),
  supcopy: () => { if (navigator.clipboard) navigator.clipboard.writeText(supportReport(S.supIds)).then(() => toast('Report copied'), () => {}); },
  supsave: () => download('open-support-report.txt', supportReport(S.supIds), 'text/plain'),
  fwcancel: () => { if (window.native) native.fwCancel(); },
  rate: v => modal(`<h2>Thank you</h2><p class="mut">Tell us more about your ${h(v)}-star experience. Real feedback shapes the next version.</p><div class="row"><a class="btn" href="${waLink('Open feedback: ' + v + '/5. ')}" target="_blank" rel="noopener">WhatsApp</a>${mailBtn('Open feedback ' + v + '/5', 'My rating: ' + v + '/5\n')}${APP.reviewUrl ? `<a class="btn sec" href="${h(APP.reviewUrl)}" target="_blank" rel="noopener">Public review</a>` : ''}<button class="btn sec" data-act="mx2">Close</button></div>`)
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const [a, v] = el.dataset.act.split(':');
  if (a === 'supids') return;
  if (ACT[a]) ACT[a](v, el, e);
});
document.addEventListener('change', e => {
  const t = e.target, b = t.dataset && t.dataset.bind;
  if (t.dataset && t.dataset.act === 'supids') ACT.supids('', t);
  if (!b) return;
  if (b === 'customer') { S.customer = t.value.trim(); store.set('customer', S.customer); }
  else if (b.indexOf('shop.') === 0) { const s = SHOP(); s[b.slice(5)] = t.value.trim(); store.set('shop', s); }
  else if (b === 'jq') { S.jq = t.value; render(); const i = $('#jq'); if (i) i.focus(); }
});
document.addEventListener('input', e => { if (e.target.id === 'ec') $('#ecres').innerHTML = lookupHtml(e.target.value); });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act="next"]');
  if (el && S.dfu && S.rs >= GR[S.rg].s.length - 1) {
    e.stopImmediatePropagation();
    modal('<h2>DFU steps complete</h2><p class="mut">If the screen is black and Open shows “DFU Mode”, you can continue with Erase & Restore in iOS System Repair. If an Apple logo appears, repeat the steps.</p><div class="row"><button class="btn" data-act="go:repair">Open repair</button><button class="btn sec" data-act="mx2">Close</button></div>');
  }
}, true);

if (navigator.usb) {
  navigator.usb.addEventListener('connect', () => setTimeout(scanAll, 700));
  navigator.usb.addEventListener('disconnect', () => setTimeout(scanAll, 300));
  setInterval(() => { if (!document.hidden) scanAll(); }, 3000);
}
render();
scanAll();
