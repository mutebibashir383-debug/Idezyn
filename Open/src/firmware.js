const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REDIRECTS = [301, 302, 303, 307, 308];

function hostAllowed(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    return u.protocol === 'https:' && ['apple.com', 'cdn-apple.com'].some(d => host === d || host.endsWith('.' + d));
  } catch (_) { return false; }
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', d => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

async function freeSpace(dir) {
  try { const s = await fs.promises.statfs(dir); return s.bavail * s.bsize; } catch (_) { return null; }
}

function fetchTo(url, file, start, onProgress, allow, signal, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects'));
    if (!allow(url)) return reject(new Error('Download address is not allowed'));
    const client = new URL(url).protocol === 'https:' ? https : http;
    const req = client.get(url, { headers: start ? { Range: 'bytes=' + start + '-' } : {} }, res => {
      if (REDIRECTS.includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(fetchTo(new URL(res.headers.location, url).href, file, start, onProgress, allow, signal, hops + 1));
      }
      if (res.statusCode === 416) { res.resume(); return resolve(); }
      if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return reject(new Error('Download failed (HTTP ' + res.statusCode + ')')); }
      const append = res.statusCode === 206;
      let got = append ? start : 0;
      const total = got + (Number(res.headers['content-length']) || 0);
      const out = fs.createWriteStream(file, { flags: append ? 'a' : 'w' });
      res.on('data', c => { got += c.length; onProgress(got, total); });
      res.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      res.pipe(out);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('The connection timed out')));
    if (signal) signal.addEventListener('abort', () => req.destroy(new Error('Download cancelled')));
  });
}

async function download({ url, dir, name, sha1, size, onProgress = () => {}, allow = hostAllowed, signal }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name), part = file + '.part', marker = file + '.ok';
  const stamp = String(sha1 || size);
  if (fs.existsSync(file) && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === stamp) return { path: file, cached: true };
  const free = await freeSpace(dir);
  if (size && free !== null && free < size * 2) throw new Error('Not enough free disk space. Open needs about twice the firmware size free on this computer.');
  const start = fs.existsSync(part) ? fs.statSync(part).size : 0;
  await fetchTo(url, part, start, onProgress, allow, signal);
  if (sha1) {
    if ((await sha1File(part)).toLowerCase() !== String(sha1).toLowerCase()) {
      fs.unlinkSync(part);
      throw new Error('The downloaded file failed verification and was deleted. Please try again.');
    }
  } else if (size && fs.statSync(part).size !== size) {
    throw new Error('The download is incomplete. Run it again to resume.');
  }
  fs.renameSync(part, file);
  fs.writeFileSync(marker, stamp);
  return { path: file, cached: false };
}

module.exports = { download, hostAllowed };
