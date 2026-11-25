(function (root) {
  'use strict';
  const HARDWARE = new Set(['battery', 'storage', 'sensor', 'power', 'wireless', 'thermal', 'camera']);
  const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const uniq = a => [...new Set(a)];

  function reportTime(name, text, mtime) {
    let m = /"timestamp"\s*:\s*"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text) || /Date\/Time:\s+(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text);
    if (m) return Date.parse(m[1] + 'T' + m[2] + 'Z');
    m = /(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name);
    if (m) return Date.parse(m[1] + 'T' + m[2] + ':' + m[3] + ':' + m[4] + 'Z');
    return Number(mtime) || null;
  }

  function panicText(text) {
    const m = /"panicString"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
    if (m) return m[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const i = text.search(/panic\(cpu \d+/);
    return i >= 0 ? text.slice(i, i + 8000) : text.slice(0, 8000);
  }

  function kind(name, text) {
    if (/panic/i.test(name) || /"bug_type"\s*:\s*"210"/.test(text) || /panicString|panic\(cpu \d+/.test(text)) return 'panic';
    if (/jetsam/i.test(name) || /"bug_type"\s*:\s*"298"/.test(text) || /JetsamEvent/.test(text)) return 'jetsam';
    if (/Exception Type:|Incident Identifier|"exception"\s*:|"procName"\s*:/.test(text)) return 'crash';
    return 'other';
  }

  function sensors(pt) {
    const m = /Missing sensor\(s\):\s*([^\n]+)/i.exec(pt), out = { battery: [], mic: [], baro: [], other: [] };
    if (!m) return out;
    for (const code of uniq(m[1].split(/[,\s]+/).filter(x => /^[A-Za-z0-9_]{2,8}$/.test(x)))) {
      if (/^(TG0B|TG0V|TB0T|TB1T|TB2T)$/i.test(code)) out.battery.push(code);
      else if (/^mic\d$/i.test(code)) out.mic.push(code);
      else if (/^Prs\d$/i.test(code)) out.baro.push(code);
      else out.other.push(code);
    }
    return out;
  }

  const first = (re, t) => { const m = re.exec(t); return m ? clip(m[0], 200) : null; };
  const RULES = [
    { id: 'sensor-battery', cat: 'battery', base: 62, title: 'Battery temperature sensor not responding',
      match: c => c.sn.battery.length ? 'Missing sensor(s): ' + c.sn.battery.join(', ') : null,
      explain: 'iOS could not read the battery temperature sensor. This is most often a worn battery, a loose battery connector or a damaged battery flex.',
      advice: ['Reseat the battery connector and inspect it for damage or corrosion.', 'Test with a known-good battery.', 'If the same code keeps returning with a good battery, check the board around the connector.'] },
    { id: 'sensor-mic', cat: 'sensor', base: 55, title: 'Microphone or its flex cable not responding',
      match: c => c.sn.mic.length ? 'Missing sensor(s): ' + c.sn.mic.join(', ') : null,
      explain: 'A microphone sensor was missing at the time of the panic. These sensors often sit on the charging-port flex or near the cameras, so a damaged flex or connector is a common cause.',
      advice: ['Inspect and reseat the charging-port flex and the connectors near the cameras.', 'Try a known-good charging-port flex assembly.', 'Check for liquid damage around the connectors.'] },
    { id: 'sensor-baro', cat: 'sensor', base: 40, title: 'Pressure (barometer) sensor not responding',
      match: c => c.sn.baro.length ? 'Missing sensor(s): ' + c.sn.baro.join(', ') : null,
      explain: 'The barometer sensor was not read. It is a small board-level part, so this usually needs a bench technician.',
      advice: ['Check for liquid damage.', 'If the panic repeats, board-level repair may be required.'] },
    { id: 'sensor-other', cat: 'sensor', base: 35, title: 'A sensor was not responding',
      match: c => c.sn.other.length ? 'Missing sensor(s): ' + c.sn.other.join(', ') : null,
      explain: 'iOS could not read the sensors listed. The codes are not in Open’s list, so look them up for your model in a repair guide.',
      advice: ['Search the sensor code for your exact model.', 'Reseat the connectors of the part that code belongs to.'] },
    { id: 'storage', cat: 'storage', base: 72, title: 'Storage (NAND) controller errors',
      match: c => first(/\bANS2?\b[^\n]{0,60}(panic|fatal|assert|error|timeout)|nvme[^\n]{0,60}(timeout|error|fail|assert)/i, c.pt),
      explain: 'The panic mentions the storage controller. Repeated storage errors usually mean a failing NAND chip or board fault, and restoring iOS often does not cure it.',
      advice: ['Back up immediately if the device still starts.', 'Try one clean restore to rule out corrupted software.', 'If the same panic returns after a clean restore, the storage or board needs repair.'] },
    { id: 'watchdog', cat: 'software', base: 48, title: 'A system service stopped responding (watchdog)',
      match: c => first(/no successful check-?ins? from\s+[\w.\-]+|watchdog timeout/i, c.pt),
      explain: 'iOS restarted because a service stopped answering. If it is always the same service it points to damaged software; if it varies it can be a hardware cause.',
      advice: ['Update iOS (keeps data in most cases).', 'If it continues, back up and do a clean Erase & Restore.', 'If a clean restore does not help, suspect hardware.'] },
    { id: 'smc', cat: 'power', base: 55, title: 'Power controller (SMC) fault',
      match: c => first(/\bSMC\b[^\n]{0,50}(panic|assert|fault|timeout)/i, c.pt),
      explain: 'The panic involves the system management controller, which handles power and charging. Battery, charging circuit or board power faults are the usual causes.',
      advice: ['Test with a known-good battery and charging-port flex.', 'Look for liquid damage or burn marks near the power circuits.'] },
    { id: 'pmu', cat: 'power', base: 55, title: 'Power management chip errors',
      match: c => first(/\b(AppleARMPMU|AppleSPMI|SPMI|PMU)\b[^\n]{0,60}(error|fail|timeout|assert|fault)/i, c.pt),
      explain: 'The panic mentions the power management chip or its bus. These are board-level faults and are rarely fixed by software.',
      advice: ['Check for liquid damage and short circuits.', 'Refer the board to a microsolder technician.'] },
    { id: 'aop', cat: 'sensor', base: 45, title: 'Always-on processor fault',
      match: c => first(/\bAOP\b[^\n]{0,40}(panic|NMI|assert|exception|crash)/i, c.pt),
      explain: 'The always-on processor handles motion and audio sensors. Faults here often follow a damaged sensor flex or microphone.',
      advice: ['Inspect flexes tied to microphones and motion sensors.', 'Compare with a known-good flex.'] },
    { id: 'thermal', cat: 'thermal', base: 50, title: 'Overheating protection',
      match: c => first(/thermal[^\n]{0,40}(shutdown|critical|emergency)|overtemp/i, c.pt),
      explain: 'The device shut down to protect itself from heat. Causes range from a failing battery to a short on the board, or simply a hot environment.',
      advice: ['Check for a swollen or damaged battery and stop using it if so.', 'Let the device cool and test again in normal conditions.'] },
    { id: 'wireless', cat: 'wireless', base: 50, title: 'Wi-Fi or cellular hardware errors',
      match: c => first(/apcie[^\n]{0,40}(link|error|timeout|fail)|pcie[^\n]{0,30}(link down|timeout)|baseband[^\n]{0,30}(panic|crash|timeout|assert)/i, c.pt),
      explain: 'The panic involves the wireless connection to the processor. A failing Wi-Fi or cellular module, or a nearby board fault, is a common cause.',
      advice: ['See if the panics happen when using Wi-Fi or mobile data.', 'A technician can test the wireless modules.'] },
    { id: 'camera', cat: 'camera', base: 38, title: 'Camera module errors',
      match: c => first(/AppleH\d+CamIn|Cam(era)?In[^\n]{0,30}(panic|timeout|error)/i, c.pt),
      explain: 'The panic involves the camera interface. A damaged camera module or flex can cause restarts when the camera starts.',
      advice: ['Disconnect the cameras one by one and test.', 'Replace the module that stops the panics.'] },
    { id: 'kernel', cat: 'software', base: 32, title: 'General kernel fault',
      match: c => first(/Kernel (data|instruction) abort|Kernel (text|stack)/i, c.pt),
      explain: 'The kernel hit an unexpected fault with no stronger clue. This is often software, but can be hardware if it repeats after a clean restore.',
      advice: ['Update iOS.', 'If it returns after a clean restore, test hardware.'] }
  ];

  function median(a) { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  function analyze(files) {
    const reports = [], hits = new Map(), services = {}, apps = {}, versions = {}, times = [];
    let panics = 0, crashes = 0, jetsam = 0, other = 0;
    for (const f of (files || [])) {
      const name = String(f.name || 'report'), text = String(f.text || '').slice(0, 250000);
      if (!text || text.indexOf('\u0000') !== -1) continue;
      const k = kind(name, text), t = reportTime(name, text, f.mtime);
      const ver = /"os_version"\s*:\s*"([^"]+)"/.exec(text) || /OS Version:\s+([^\n]+)/.exec(text);
      const row = { name, type: k, when: t, summary: '' };
      if (k === 'panic') {
        panics++; if (t) times.push(t);
        if (ver) versions[clip(ver[1], 60)] = (versions[clip(ver[1], 60)] || 0) + 1;
        const pt = panicText(text), c = { pt, sn: sensors(pt) };
        row.summary = clip((pt.split('\n').find(l => l.trim()) || '').replace(/^panic\(cpu \d+ caller 0x[0-9a-f]+\):\s*/i, ''), 160);
        for (const r of RULES) {
          const ev = r.match(c);
          if (!ev) continue;
          const h = hits.get(r.id) || { rule: r, n: 0, ev: [], times: [] };
          h.n++; if (h.ev.length < 3 && !h.ev.includes(clip(ev, 200))) h.ev.push(clip(ev, 200)); if (t) h.times.push(t);
          hits.set(r.id, h);
        }
        for (const m of pt.matchAll(/no successful check-?ins? from\s+([\w.\-]+)/gi)) services[m[1]] = (services[m[1]] || 0) + 1;
      } else if (k === 'crash') {
        crashes++;
        const p = /"procName"\s*:\s*"([^"]+)"/.exec(text) || /^Process:\s+(\S+)/m.exec(text) || /^Identifier:\s+(\S+)/m.exec(text);
        if (p) { const a = clip(p[1], 60); apps[a] = (apps[a] || 0) + 1; row.summary = a; }
      } else if (k === 'jetsam') { jetsam++; row.summary = 'Memory pressure report'; } else other++;
      reports.push(row);
    }
    const findings = [...hits.values()].map(h => {
      let conf = h.rule.base + 8 * (h.n - 1) + (h.n >= 3 ? 5 : 0), note = '';
      if (h.rule.id === 'watchdog') {
        const top = Object.entries(services).sort((a, b) => b[1] - a[1])[0];
        if (top && h.n >= 3 && top[1] / h.n >= 0.6) { conf += 6; note = 'The same service (' + top[0] + ') stopped responding in most reports.'; }
        else if (top) note = 'Service named most often: ' + top[0] + ' (' + top[1] + ' report' + (top[1] > 1 ? 's' : '') + ').';
      }
      return { id: h.rule.id, cat: h.rule.cat, hardware: HARDWARE.has(h.rule.cat), title: h.rule.title, confidence: Math.min(90, Math.round(conf)), count: h.n, evidence: h.ev, explain: h.rule.explain + (note ? ' ' + note : ''), advice: h.rule.advice };
    }).sort((a, b) => b.confidence - a.confidence);
    times.sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => (t - times[i]) / 36e5).filter(g => g > 0.02);
    const med = gaps.length ? median(gaps) : null;
    const mad = gaps.length ? median(gaps.map(g => Math.abs(g - med))) : null;
    const timeline = { first: times[0] || null, last: times[times.length - 1] || null, medianHours: med == null ? null : Math.round(med * 10) / 10, regular: gaps.length >= 4 && med > 0 && mad / med < 0.15,
      last7: times.length ? times.filter(t => t >= times[times.length - 1] - 7 * 864e5).length : 0 };
    const hw = Math.max(0, ...findings.filter(f => f.hardware).map(f => f.confidence)), sw = Math.max(0, ...findings.filter(f => !f.hardware).map(f => f.confidence));
    let lean = 'none', headline = 'No panic reports were found, so there is no sign of a system-level crash.';
    if (panics) {
      if (!findings.length) { lean = 'unclear'; headline = panics + ' panic report(s) found, but none matched a known pattern.'; }
      else if (hw >= sw + 10 && hw >= 50) { lean = 'hardware'; headline = 'The reports lean towards a hardware cause: ' + findings.find(f => f.hardware).title.toLowerCase() + '.'; }
      else if (sw >= hw + 10 && sw >= 40) { lean = 'software'; headline = 'The reports lean towards a software cause. A clean update or restore is worth trying first.'; }
      else { lean = 'unclear'; headline = 'The reports do not point clearly to hardware or software.'; }
    }
    const steps = lean === 'software'
      ? ['Back up if the device still runs.', 'Update iOS (keeps data in most cases).', 'If panics continue, do a clean Erase & Restore.', 'If they return after a clean restore, treat it as hardware.']
      : lean === 'hardware' ? uniq(findings.filter(f => f.hardware).slice(0, 2).flatMap(f => f.advice)).slice(0, 5).concat(['Back up first if the device still runs.'])
      : panics ? ['Collect more reports over a few days and analyze again.', 'Try one clean update, then compare new reports.'] : [];
    return { files: reports.length, panics, crashes, jetsam, other, findings, timeline, versions, services, apps: Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 6),
      reports: reports.sort((a, b) => (b.when || 0) - (a.when || 0)).slice(0, 200), verdict: { lean, headline, steps } };
  }

  const api = { analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CrashLog = api;
})(typeof window !== 'undefined' ? window : globalThis);
