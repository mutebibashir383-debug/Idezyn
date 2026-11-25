const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const muxd = require('../src/muxd');

const VALUES = { ProductType: 'iPhone14,2', ProductVersion: '17.5.1', DeviceName: "Alex's iPhone", PasswordProtected: true };

function frame(message, tag, little) {
  const body = Buffer.from(muxd.plistDoc(message));
  const head = Buffer.alloc(little ? 16 : 4);
  if (little) { head.writeUInt32LE(16 + body.length, 0); head.writeUInt32LE(1, 4); head.writeUInt32LE(8, 8); head.writeUInt32LE(tag, 12); }
  else head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

function mockService() {
  const seen = {};
  const server = net.createServer(socket => {
    let buf = Buffer.alloc(0), lockdown = false;
    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (!lockdown) {
          if (buf.length < 16 || buf.length < buf.readUInt32LE(0)) return;
          const len = buf.readUInt32LE(0), req = muxd.parsePlist(buf.subarray(16, len).toString());
          buf = buf.subarray(len);
          if (req.MessageType === 'ListDevices') socket.write(frame({ DeviceList: [
            { DeviceID: 7, Properties: { ConnectionType: 'USB', DeviceID: 7, ProductID: 4776, SerialNumber: '00008110-001A2B3C4D5E6F78' } },
            { DeviceID: 9, Properties: { ConnectionType: 'Network', SerialNumber: 'wifi-only' } }] }, 1, true));
          else { seen.port = req.PortNumber; seen.id = req.DeviceID; socket.write(frame({ MessageType: 'Result', Number: 0 }, 2, true)); lockdown = true; }
        } else {
          if (buf.length < 4 || buf.length < 4 + buf.readUInt32BE(0)) return;
          const len = buf.readUInt32BE(0), req = muxd.parsePlist(buf.subarray(4, 4 + len).toString());
          buf = buf.subarray(4 + len);
          socket.write(frame(req.Request === 'QueryType' ? { Type: 'com.apple.mobile.lockdown' }
            : req.Key in VALUES ? { Key: req.Key, Value: VALUES[req.Key] } : { Key: req.Key, Error: 'GetProhibited' }, 0, false));
        }
      }
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, seen, endpoint: { host: '127.0.0.1', port: server.address().port } })));
}

test('plist values survive a round trip', () => {
  const back = muxd.parsePlist(muxd.plistDoc({ a: 'x & <y>', n: 42, t: true, l: [1, 'two', false], d: { k: 'v' } }));
  assert.deepStrictEqual(back, { a: 'x & <y>', n: 42, t: true, l: [1, 'two', false], d: { k: 'v' } });
});

test('lists USB devices and reads the values the device shares', async () => {
  const { server, seen, endpoint } = await mockService();
  const devices = await muxd.listDevices(endpoint);
  assert.deepStrictEqual(devices.map(d => d.udid), ['00008110-001A2B3C4D5E6F78']);
  const info = await muxd.lockdownInfo(endpoint, 7, ['ProductType', 'ProductVersion', 'DeviceName', 'SerialNumber', 'PasswordProtected']);
  assert.strictEqual(info.ProductType, 'iPhone14,2');
  assert.strictEqual(info.DeviceName, "Alex's iPhone");
  assert.strictEqual(info.PasswordProtected, true);
  assert.ok(!('SerialNumber' in info));
  assert.strictEqual(seen.port, 32498);
  assert.strictEqual(await muxd.reachable(endpoint), true);
  assert.strictEqual(await muxd.reachable({ host: '127.0.0.1', port: 1 }), false);
  server.close();
});
