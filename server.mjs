// Gateway tự host: extension Chrome gửi bình luận về /ingest, ứng dụng khác nhận qua WebSocket
//   ws://localhost:8787?uniqueId=<kênh>&apiKey=<GATEWAY_API_KEY>
// Sự kiện có dạng { event, data }, cùng định dạng chat mà các client của tik.tools đang đọc.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const API_KEY = process.env.GATEWAY_API_KEY || '';
if (!API_KEY) {
  console.error('Thiếu GATEWAY_API_KEY: chép .env.example thành .env rồi đặt key.');
  process.exit(1);
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PAGE = path.join(ROOT, 'mock', 'live.html');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ROOM_RE = /^[\w.-]{1,64}$/;
const MAX_BODY = 256 * 1024;

const normRoom = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();
const sha = (s) => crypto.createHash('sha256').update(s).digest();
const validKey = (k) => crypto.timingSafeEqual(sha(String(k || '')), sha(API_KEY));

// ---------- Kênh và client ----------
const rooms = new Map(); // uniqueId → { clients:Set, lastMessageAt }
const getRoom = (id) => {
  if (!rooms.has(id)) rooms.set(id, { clients: new Set(), lastMessageAt: 0 });
  return rooms.get(id);
};

let msgId = 0;
function toChatEvent(room, m) {
  const name = m.user.slice(0, 100) || 'ẩn danh';
  const avatar = typeof m.avatar === 'string' && m.avatar.startsWith('https://') ? m.avatar.slice(0, 1000) : '';
  return {
    event: 'chat',
    data: {
      msgId: String(++msgId),
      roomId: room,
      comment: m.text.slice(0, 500),
      timestamp: m.ts,
      // Trang live chỉ hiển thị tên nên uniqueId cũng là tên: hai người trùng tên sẽ bị coi là một.
      user: { uniqueId: name, nickname: name, avatarUrl: avatar },
    },
  };
}

function publish(room, messages) {
  const r = getRoom(room);
  r.lastMessageAt = Date.now();
  for (const m of messages) {
    if (!m || typeof m.user !== 'string' || typeof m.text !== 'string' || !Number.isFinite(m.ts)) continue;
    const ev = toChatEvent(room, m);
    console.log(`[@${room}] ${ev.data.user.nickname}: ${ev.data.comment}`);
    const s = JSON.stringify(ev);
    r.clients.forEach((c) => c.readyState === 1 && c.send(s));
  }
}

// ---------- HTTP ----------
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Chỉ nhận từ chính máy này và từ extension, website khác không gửi tin giả vào được.
async function ingest(req, res) {
  const origin = req.headers.origin || '';
  if (!LOOPBACK.has(req.socket.remoteAddress) || !origin.startsWith('chrome-extension://')) return res.writeHead(403).end();
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return res.writeHead(e.status || 400).end();
  }
  const room = normRoom(body && body.room);
  if (!ROOM_RE.test(room) || !Array.isArray(body.messages)) return res.writeHead(400).end();
  publish(room, body.messages);
  res.writeHead(204).end();
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://x').pathname;
  } catch {
    return res.writeHead(400).end();
  }
  if (req.method === 'POST' && pathname === '/ingest') return ingest(req, res);
  if (req.method === 'GET' && pathname === '/health') {
    const list = [...rooms].map(([uniqueId, r]) => ({ uniqueId, clients: r.clients.size, lastMessageAt: r.lastMessageAt }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, rooms: list }));
  }
  if (req.method === 'GET' && pathname === '/mock/live.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(MOCK_PAGE).pipe(res);
  }
  res.writeHead(404).end();
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({
  server,
  maxPayload: 1024,
  verifyClient({ req }, done) {
    const q = new URL(req.url, 'http://x').searchParams;
    if (!validKey(q.get('apiKey'))) return done(false, 401, 'Unauthorized');
    if (!ROOM_RE.test(normRoom(q.get('uniqueId')))) return done(false, 400, 'Bad uniqueId');
    done(true);
  },
});

wss.on('connection', (ws, req) => {
  const room = normRoom(new URL(req.url, 'http://x').searchParams.get('uniqueId'));
  const r = getRoom(room);
  r.clients.add(ws);
  ws.on('error', () => {});
  ws.on('close', () => r.clients.delete(ws));
  ws.send(JSON.stringify({ event: 'connected', data: { uniqueId: room } }));
});

server.listen(PORT, HOST, () => console.log(`Gateway: ws://${HOST}:${PORT}?uniqueId=<kênh>&apiKey=<key>`));
