const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const firmware = require('../src/firmware');

const data = crypto.randomBytes(200000);
const sha1 = crypto.createHash('sha1').update(data).digest('hex');
const local = url => url.startsWith('http://127.0.0.1');

function serve() {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.headers.range || 'full');
    if (req.url === '/redirect') { res.writeHead(302, { location: '/file' }); return res.end(); }
    const m = /bytes=(\d+)-/.exec(req.headers.range || '');
    if (m) {
      const start = Number(m[1]);
      if (start >= data.length) { res.writeHead(416); return res.end(); }
      res.writeHead(206, { 'content-length': data.length - start });
      return res.end(data.subarray(start));
    }
    res.writeHead(200, { 'content-length': data.length });
    res.end(data);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, requests, base: 'http://127.0.0.1:' + server.address().port })));
}

test('resumes a partial download, follows redirects and verifies the checksum', async () => {
  const { server, requests, base } = await serve();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-fw-'));
  fs.writeFileSync(path.join(dir, 'a.ipsw.part'), data.subarray(0, 50000));
  const r = await firmware.download({ url: base + '/redirect', dir, name: 'a.ipsw', sha1, size: data.length, allow: local });
  assert.ok(requests.includes('bytes=50000-'));
  assert.ok(fs.readFileSync(r.path).equals(data));
  const again = await firmware.download({ url: base + '/file', dir, name: 'a.ipsw', sha1, size: data.length, allow: local });
  assert.strictEqual(again.cached, true);
  server.close();
});

test('rejects and deletes a file whose checksum does not match', async () => {
  const { server, base } = await serve();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-fw-'));
  await assert.rejects(firmware.download({ url: base + '/file', dir, name: 'b.ipsw', sha1: '0'.repeat(40), size: data.length, allow: local }), /verification/);
  assert.ok(!fs.existsSync(path.join(dir, 'b.ipsw')));
  server.close();
});

test('only downloads from Apple hosts over https', async () => {
  assert.ok(firmware.hostAllowed('https://updates.cdn-apple.com/x'));
  assert.ok(firmware.hostAllowed('https://appldnld.apple.com/x'));
  assert.ok(!firmware.hostAllowed('https://evil-apple.com/x'));
  assert.ok(!firmware.hostAllowed('http://updates.apple.com/x'));
  await assert.rejects(firmware.download({ url: 'https://evil.example.com/x.ipsw', dir: os.tmpdir(), name: 'c.ipsw', sha1, size: 1 }), /not allowed/);
});
