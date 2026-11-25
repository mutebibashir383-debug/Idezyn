'use strict';
// Minimal client for Apple's usbmuxd service (installed with Apple Devices and iTunes on
// Windows, built into macOS). It lists USB-connected devices and reads the basic values
// lockdownd shares before a device is paired, so no extra tools are needed to name a device.
const net = require('net');

const LOCKDOWN_PORT = 62078;
const TIMEOUT = 4000;

const escapeXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeXml = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function toXml(v) {
  if (typeof v === 'string') return `<string>${escapeXml(v)}</string>`;
  if (typeof v === 'boolean') return v ? '<true/>' : '<false/>';
  if (typeof v === 'number') return Number.isInteger(v) ? `<integer>${v}</integer>` : `<real>${v}</real>`;
  if (Array.isArray(v)) return `<array>${v.map(toXml).join('')}</array>`;
  if (v && typeof v === 'object') return `<dict>${Object.entries(v).map(([k, x]) => `<key>${escapeXml(k)}</key>${toXml(x)}`).join('')}</dict>`;
  return '<string></string>';
}

const plistDoc = obj => '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
  `<plist version="1.0">${toXml(obj)}</plist>\n`;

function convert(node) {
  switch (node && node.t) {
    case 'dict': {
      const out = {};
      for (let i = 0; i + 1 < node.c.length; i += 2) out[unescapeXml(node.c[i].text || '')] = convert(node.c[i + 1]);
      return out;
    }
    case 'array': return node.c.map(convert);
    case 'string': return unescapeXml(node.text || '');
    case 'integer': case 'real': return Number(node.text);
    case 'true': return true;
    case 'false': return false;
    case 'data': return Buffer.from((node.text || '').replace(/\s+/g, ''), 'base64');
    case 'date': return node.text || '';
    default: return null;
  }
}

function parsePlist(xml) {
  const body = String(xml).replace(/<\?xml[\s\S]*?\?>/, '').replace(/<!DOCTYPE[\s\S]*?>/, '');
  const re = /<(\/?)([A-Za-z]+)[^>]*?(\/?)>|([^<]+)/g;
  const root = { t: 'root', c: [] };
  const stack = [root];
  let m;
  while ((m = re.exec(body))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      if (['key', 'string', 'integer', 'real', 'data', 'date'].includes(top.t)) top.text = (top.text || '') + m[4];
      continue;
    }
    if (m[1] === '/') { stack.pop(); continue; }
    const node = { t: m[2], c: [] };
    top.c.push(node);
    if (m[3] !== '/') stack.push(node);
  }
  const plist = root.c.find(n => n.t === 'plist');
  return plist && plist.c[0] ? convert(plist.c[0]) : null;
}

function defaultEndpoint() {
  return process.platform === 'win32' ? { host: '127.0.0.1', port: 27015 } : { path: '/var/run/usbmuxd' };
}

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    this.error = null;
    this.closed = false;
    socket.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.flush(); });
    socket.on('error', e => { this.error = e; this.flush(); });
    socket.on('close', () => { this.closed = true; this.flush(); });
  }
  flush() {
    while (this.waiters.length) {
      const w = this.waiters[0];
      if (this.buf.length >= w.n) { this.waiters.shift(); const out = this.buf.subarray(0, w.n); this.buf = this.buf.subarray(w.n); w.resolve(out); }
      else if (this.error || this.closed) { this.waiters.shift(); w.reject(this.error || new Error('Connection closed')); }
      else break;
    }
  }
  read(n, ms = TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out')), ms);
      this.waiters.push({ n, resolve: b => { clearTimeout(timer); resolve(b); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.flush();
    });
  }
  write(b) { this.socket.write(b); }
  close() { this.socket.destroy(); }
}

function open(endpoint) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint || defaultEndpoint());
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Timed out')); }, TIMEOUT);
    socket.once('connect', () => { clearTimeout(timer); resolve(new Conn(socket)); });
    socket.once('error', e => { clearTimeout(timer); reject(e); });
  });
}

async function muxSend(conn, message, tag) {
  const payload = Buffer.from(plistDoc(message), 'utf8');
  const head = Buffer.alloc(16);
  head.writeUInt32LE(16 + payload.length, 0);
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(8, 8);
  head.writeUInt32LE(tag, 12);
  conn.write(Buffer.concat([head, payload]));
}

async function muxReceive(conn) {
  const head = await conn.read(16);
  const length = head.readUInt32LE(0);
  if (length < 16 || length > 4e6) throw new Error('Unexpected reply from the Apple Mobile Device service');
  return parsePlist((await conn.read(length - 16)).toString('utf8'));
}

const client = { ClientVersionString: 'open', ProgName: 'Open', kLibUSBMuxVersion: 3 };

async function reachable(endpoint) {
  try { (await open(endpoint)).close(); return true; } catch (_) { return false; }
}

async function listDevices(endpoint) {
  const conn = await open(endpoint);
  try {
    await muxSend(conn, { MessageType: 'ListDevices', ...client }, 1);
    const reply = await muxReceive(conn);
    return ((reply && reply.DeviceList) || [])
      .map(d => d.Properties)
      .filter(p => p && p.ConnectionType === 'USB' && p.SerialNumber)
      .map(p => ({ id: p.DeviceID, udid: String(p.SerialNumber), productId: p.ProductID }));
  } finally { conn.close(); }
}

async function lockdownInfo(endpoint, deviceId, keys) {
  const conn = await open(endpoint);
  try {
    const port = ((LOCKDOWN_PORT & 0xff) << 8) | (LOCKDOWN_PORT >> 8);
    await muxSend(conn, { MessageType: 'Connect', ...client, DeviceID: deviceId, PortNumber: port }, 2);
    const result = await muxReceive(conn);
    if (!result || result.Number !== 0) throw new Error('The device refused the connection');
    const ask = async request => {
      const body = Buffer.from(plistDoc({ Label: 'open', ...request }), 'utf8');
      const head = Buffer.alloc(4);
      head.writeUInt32BE(body.length);
      conn.write(Buffer.concat([head, body]));
      const length = (await conn.read(4)).readUInt32BE(0);
      if (length > 4e6) throw new Error('Unexpected reply from the device');
      return parsePlist((await conn.read(length)).toString('utf8'));
    };
    await ask({ Request: 'QueryType' });
    const info = {};
    for (const key of keys) {
      try {
        const r = await ask({ Request: 'GetValue', Key: key });
        if (r && r.Value !== undefined && !r.Error) info[key] = r.Value;
      } catch (_) { if (conn.closed || conn.error) break; }
    }
    return info;
  } finally { conn.close(); }
}

module.exports = { parsePlist, plistDoc, listDevices, lockdownInfo, reachable, defaultEndpoint };
