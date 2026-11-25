const test = require('node:test');
const assert = require('node:assert');
const { validCall } = require('../src/rules');

const state = { backupDir: '/backups', ipswPath: '/firmware/a.ipsw' };
const UDID = '00008110-001A2B3C4D5E6F78';

test('allows the fixed set of read and recovery commands', () => {
  assert.ok(validCall('idevice_id', ['-l'], state));
  assert.ok(validCall('ideviceinfo', ['-u', UDID], state));
  assert.ok(validCall('ideviceinfo', ['-u', UDID, '-q', 'com.apple.mobile.battery'], state));
  assert.ok(validCall('irecovery', ['-i', '0x1A2B3C4D5E6F7', '-n'], state));
  assert.ok(validCall('idevicediagnostics', ['-u', UDID, 'ioregentry', 'AppleSmartBattery'], state));
  assert.ok(validCall('irecovery', ['--version'], state));
});

test('rejects unknown tools, domains, raw commands and malformed identifiers', () => {
  assert.ok(!validCall('bash', ['-c', 'id'], state));
  assert.ok(!validCall('ideviceinfo', ['-q', 'com.example.other'], state));
  assert.ok(!validCall('ideviceinfo', ['-u', '; rm -rf /'], state));
  assert.ok(!validCall('irecovery', ['-c', 'reboot'], state));
  assert.ok(!validCall('idevicediagnostics', ['restart'], state));
});

test('backups and restores are limited to the paths chosen in the app', () => {
  assert.ok(validCall('idevicebackup2', ['-u', UDID, 'backup', '/backups'], state));
  assert.ok(!validCall('idevicebackup2', ['backup', '/etc'], state));
  assert.ok(validCall('idevicerestore', ['-e', '/firmware/a.ipsw'], state));
  assert.ok(!validCall('idevicerestore', ['-e', '/tmp/other.ipsw'], state));
  assert.ok(!validCall('idevicerestore', ['-e', '/firmware/a.ipsw'], {}));
});
