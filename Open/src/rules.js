const UDID = /^[0-9A-Fa-f-]{8,64}$/;
const ECID = /^0x[0-9A-Fa-f]{1,16}$/;
const DOMAINS = new Set(['com.apple.mobile.battery', 'com.apple.disk_usage']);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function strip(args, flag, pattern) {
  if (args[0] !== flag) return args;
  return pattern.test(args[1] || '') ? args.slice(2) : null;
}

function makeRules(state) {
  return {
    idevice_id: a => same(a, ['-l']),
    ideviceinfo: a => {
      const r = strip(a, '-u', UDID);
      return !!r && (r.length === 0 || (r.length === 2 && r[0] === '-q' && DOMAINS.has(r[1])));
    },
    ideviceenterrecovery: a => a.length === 1 && UDID.test(a[0]),
    irecovery: a => {
      const r = strip(a, '-i', ECID);
      return !!r && (same(r, ['-q']) || same(r, ['-n']));
    },
    idevicediagnostics: a => {
      const r = strip(a, '-u', UDID);
      return !!r && same(r, ['ioregentry', 'AppleSmartBattery']);
    },
    idevicebackup2: a => {
      const r = strip(a, '-u', UDID);
      return !!r && r.length === 2 && r[0] === 'backup' && !!state.backupDir && r[1] === state.backupDir;
    },
    idevicerestore: a => same(a, ['-l']) || same(a, ['-e', '-l']) ||
      (!!state.ipswPath && (same(a, [state.ipswPath]) || same(a, ['-e', state.ipswPath])))
  };
}

function validCall(name, args, state) {
  if (!Array.isArray(args) || !args.every(x => typeof x === 'string')) return false;
  const rules = makeRules(state);
  if (!Object.prototype.hasOwnProperty.call(rules, name)) return false;
  return same(args, ['--version']) || rules[name](args);
}

module.exports = { validCall, UDID };
