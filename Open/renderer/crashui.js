Object.assign(I, { crash: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>' });
NAV.splice(5, 0, ['crash', 'Crash Logs']);
S.crash = null; S.crashSrc = '';
const CATNAME = { battery: 'Battery / charging', storage: 'Storage', sensor: 'Sensor / flex cable', power: 'Power management', wireless: 'Wi-Fi / cellular', thermal: 'Heat', camera: 'Camera', software: 'Software' };
const stamp = t => t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '—';

function crashText(r) {
  const L = ['Open crash log analysis · ' + new Date().toISOString(), r.verdict.headline, '',
    `Reports: ${r.files} (panics ${r.panics}, app crashes ${r.crashes}, memory ${r.jetsam})`, `Range: ${stamp(r.timeline.first)} to ${stamp(r.timeline.last)}`, ''];
  r.findings.forEach(f => { L.push(`- ${f.title} [${CATNAME[f.cat]}] confidence ${f.confidence}%, ${f.count} report(s)`, '  ' + f.explain); f.evidence.forEach(e => L.push('  evidence: ' + e)); });
  if (r.verdict.steps.length) { L.push('', 'Next steps:'); r.verdict.steps.forEach((s, i) => L.push((i + 1) + '. ' + s)); }
  L.push('', 'Probable causes from known patterns, not a certain diagnosis.');
  return L.join('\n');
}

P.crash = () => {
  const r = S.crash, d = S.dev, can = window.native && d && d.mode === 'Normal Mode';
  const head = `<div class="fade"><h1>Crash Logs</h1><p class="mut">Reads the device’s panic and crash reports and points to likely causes. Reading is read-only: the reports stay on the device.</p>
<div class="card" style="margin-bottom:16px"><div class="row"><button class="btn" data-act="crashdev" ${can ? '' : 'disabled'}>Read from connected device</button><button class="btn sec" data-act="crashfiles" ${window.native ? '' : 'disabled'}>Open report files…</button><button class="btn sec" data-act="crashfolder" ${window.native ? '' : 'disabled'}>Open a folder…</button>${r ? '<button class="btn sec" data-act="crashtxt">Export text</button><button class="btn sec" data-act="crashpdf">PDF report</button><button class="btn sec" data-act="crashclear">Clear</button>' : ''}</div>
<p class="mut" style="font-size:14px">${window.native ? (can ? 'Ready: ' + h(d.model) + '.' : 'To read from a device it must start up, be unlocked and tapped “Trust”. A device stuck in Recovery Mode has no readable reports.') : 'The desktop app is needed to read reports.'} Reports synced by Finder or iTunes are in <b>~/Library/Logs/CrashReporter/MobileDevice/</b> (Mac) or <b>%APPDATA%\\Apple Computer\\Logs\\CrashReporter\\MobileDevice\\</b> (Windows).</p></div>`;
  if (!r) return head + '</div>';
  if (!r.files) return head + '<div class="card"><p>No readable reports were found. A healthy device may simply have none.</p></div></div>';
  const lean = { hardware: 'Leans hardware', software: 'Leans software', unclear: 'Unclear', none: 'No panics' }[r.verdict.lean], tl = r.timeline;
  const stats = [['Reports analyzed', r.files], ['Panics', r.panics], ['App crashes', r.crashes], ['Memory reports', r.jetsam], ['First to last panic', tl.first ? stamp(tl.first) + ' to ' + stamp(tl.last) : '—'], ['Panics in last 7 days of data', tl.last7], ['Typical gap between panics', tl.medianHours != null ? tl.medianHours + ' hours' + (tl.regular ? ' (very regular)' : '') : '—'], ['iOS versions seen', Object.entries(r.versions).map(([v, n]) => v + ' ×' + n).join(', ') || '—']];
  return head + `<div class="card" style="margin-bottom:16px"><span class="pill">${lean}</span><h2 style="margin-top:12px">${h(r.verdict.headline)}</h2>${r.verdict.steps.length ? '<ol class="mut">' + r.verdict.steps.map(s => '<li>' + h(s) + '</li>').join('') + '</ol>' : ''}${tl.regular ? '<p class="mut">The panics are evenly spaced. That is worth telling the technician: it can point to something recurring rather than random.</p>' : ''}</div>
${r.findings.map(f => `<div class="card" style="margin-bottom:12px"><b>${h(f.title)}</b><span class="badge ${f.hardware ? 'erase' : 'keep'}">${h(CATNAME[f.cat])}</span><div class="bar" role="meter" aria-label="Confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${f.confidence}" style="margin:10px 0"><b style="width:${f.confidence}%"></b></div><p class="mut" style="margin:0 0 6px">Confidence ${f.confidence}% · seen in ${f.count} report${f.count > 1 ? 's' : ''}</p><p>${h(f.explain)}</p>${f.evidence.map(e => `<pre class="mut" style="white-space:pre-wrap;font-size:14px;margin:6px 0">${h(e)}</pre>`).join('')}<ul class="mut">${f.advice.map(a => '<li>' + h(a) + '</li>').join('')}</ul></div>`).join('')}
<div class="grid g2"><div class="card"><h2>Timeline and counts</h2><table>${stats.map(s => `<tr><td>${h(s[0])}</td><td>${h(s[1])}</td></tr>`).join('')}</table></div><div class="card"><h2>Apps that crashed</h2>${r.apps.length ? '<table>' + r.apps.map(a => `<tr><td>${h(a[0])}</td><td>${a[1]} time${a[1] > 1 ? 's' : ''}</td></tr>`).join('') + '</table><p class="mut" style="font-size:14px">One app crashing alone points to that app. Update or reinstall it.</p>' : '<p class="mut">No app crashes found.</p>'}</div></div>
<div class="card" style="margin-top:16px;overflow-x:auto"><h2>Reports</h2><table class="jt"><tr><th>Time</th><th>Type</th><th>Summary</th></tr>${r.reports.slice(0, 25).map(x => `<tr><td>${h(stamp(x.when))}</td><td>${h(x.type)}</td><td>${h(x.summary || x.name)}</td></tr>`).join('')}</table></div>
<p class="mut" style="font-size:14px;margin-top:14px">These are probable causes from known patterns, not a certain diagnosis. Confirm with hardware tests before replacing parts.</p></div>`;
};

function crashShow(files, src) {
  S.crash = CrashLog.analyze(files); S.crashSrc = src; closeM();
  logJob('Crash log analysis', true, S.crash.verdict.headline, S.dev);
  go('crash');
}
async function crashDevice() {
  if (!window.native || !S.dev || S.dev.mode !== 'Normal Mode') return;
  modal('<div class="spin"></div><p style="text-align:center">Reading crash reports. This can take a minute…</p>');
  const r = await native.crashCollect(S.dev.udid || '');
  if (!r.ok) return result(false, '', 'Could not read crash reports', r.message || '');
  crashShow(r.files, 'device');
}
async function crashOpen(kind) {
  if (!window.native) return;
  const r = await native.crashOpen(kind);
  if (!r.ok) { if (!r.canceled) result(false, '', 'Could not open reports', r.message || ''); return; }
  crashShow(r.files, 'files');
}
function crashPdf() {
  if (!window.native || !S.crash) return toast('PDF reports are available in the desktop app.');
  const r = S.crash;
  const diag = [{ s: r.verdict.lean === 'hardware' ? 'fail' : 'warn', t: 'Verdict', d: r.verdict.headline }].concat(r.findings.map(f => ({ s: f.confidence >= 60 ? 'fail' : 'warn', t: f.title + ' (' + f.confidence + '% confidence, ' + f.count + ' report' + (f.count > 1 ? 's' : '') + ')', d: f.explain })));
  native.savePdf(reportHtml({ customer: S.customer, device: S.dev, diag, jobs: [] }), 'crash-analysis-' + new Date().toISOString().slice(0, 10)).then(x => toast(x.ok ? 'Report saved.' : x.canceled ? 'Cancelled.' : 'Could not create the PDF.'));
}
const CRASHACT = {
  crashdev: crashDevice,
  crashfiles: () => crashOpen('files'),
  crashfolder: () => crashOpen('folder'),
  crashtxt: () => S.crash && download('open-crash-analysis.txt', crashText(S.crash), 'text/plain'),
  crashpdf: crashPdf,
  crashclear: () => { S.crash = null; render(); }
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && CRASHACT[el.dataset.act.split(':')[0]]) CRASHACT[el.dataset.act.split(':')[0]](); });

SYMP.push(['panic', 'Restarts randomly or shows a panic report', 'It reboots by itself, or Analytics data mentions “panic”.']);
const _plan = plan;
plan = function (id) {
  if (id !== 'panic') return _plan(id);
  const det = !!S.dev;
  return [
    ...(det ? [] : [{ t: 'Connect and detect the device', d: 'Plug it in with a data cable, unlock it and tap Trust.', keep: null, acts: [['Open Home', 'go:home']] }]),
    { t: 'Read the crash logs', d: 'Open reads the panic reports and points to likely causes, such as battery, storage or software. Nothing is deleted from the device.', keep: true, acts: [['Open Crash Logs', 'go:crash']] },
    { t: 'Update iOS (keeps data)', d: 'If the logs point to software, an update is the least destructive fix.', keep: true, acts: [['Start update', 'rep:0']] },
    { t: 'Clean Erase & Restore', d: 'Only if panics continue after an update and the logs lean towards software. Back up first.', keep: false, acts: [['Open repair', 'rep:4']] },
    HW
  ];
};
render();
