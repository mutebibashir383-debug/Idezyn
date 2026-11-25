const test = require('node:test');
const assert = require('node:assert');
const { analyze } = require('../renderer/crashlog');

const panic = (when, text, version = 'iPhone OS 17.5 (21F79)') => ({
  name: 'panic-full-' + when.replace(/[: ]/g, '-') + '.000.ips',
  text: JSON.stringify({ bug_type: '210', timestamp: when + '.00 +0000', os_version: version }) + '\n' + JSON.stringify({ panicString: text })
});

test('repeated battery sensor panics point to hardware with growing confidence', () => {
  const days = [1, 2, 3, 4, 5].map(d => panic('2026-11-0' + d + ' 03:00:00', 'panic(cpu 1): "thermalmonitord" exited\nMissing sensor(s): TG0B'));
  const r = analyze(days);
  assert.strictEqual(r.findings[0].id, 'sensor-battery');
  assert.strictEqual(r.verdict.lean, 'hardware');
  assert.ok(r.findings[0].confidence > 62 && r.findings[0].confidence <= 90);
  assert.strictEqual(r.timeline.regular, true);
});

test('a repeating watchdog on one service leans software', () => {
  const r = analyze(['2026-11-01 10:00:00', '2026-11-03 21:30:00', '2026-11-07 02:10:00'].map(t => panic(t, 'panic(cpu 3): userspace watchdog timeout: no successful checkins from SpringBoard in 180 seconds')));
  assert.strictEqual(r.verdict.lean, 'software');
  assert.match(r.findings[0].explain, /SpringBoard/);
});

test('unknown panics are called unclear, and app crashes alone give no panic verdict', () => {
  assert.strictEqual(analyze([panic('2026-11-01 10:00:00', 'panic(cpu 0): something unusual')]).verdict.lean, 'unclear');
  const apps = analyze([{ name: 'MyApp-2026-11-01-101010.ips', text: 'Exception Type: EXC_BAD_ACCESS\nProcess: MyApp\nIncident Identifier: X' }]);
  assert.strictEqual(apps.verdict.lean, 'none');
  assert.strictEqual(apps.apps[0][0], 'MyApp');
});

test('empty, binary and oversized input is handled', () => {
  assert.strictEqual(analyze([]).verdict.lean, 'none');
  assert.strictEqual(analyze(null).files, 0);
  assert.strictEqual(analyze([{ name: 'x.bin', text: 'a\u0000b' }]).files, 0);
  assert.strictEqual(analyze([{ name: 'a.ips', text: 'x'.repeat(900000) + 'panic(cpu 1' }]).files, 1);
});
