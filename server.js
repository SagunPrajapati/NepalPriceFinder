/**
 * Nepal Price Finder — Secure Backend
 * - Groq API key stored only here, never sent to browser
 * - Admin password verified via bcrypt hash
 * - Sessions expire after 2 hours of inactivity
 */

require('dotenv').config();
const express    = require('express');
const bcrypt     = require('bcrypt');
const crypto     = require('crypto');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  const expiry = sessions.get(token);
  if (Date.now() > expiry) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of sessions) if (now > exp) sessions.delete(t);
}, 30 * 60 * 1000);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const rateLimits = new Map();
function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const win = rateLimits.get(ip) || { count: 0, start: now };
  if (now - win.start > 60000) { win.count = 0; win.start = now; }
  win.count++;
  rateLimits.set(ip, win);
  if (win.count > 30) return res.status(429).json({ error: 'Too many requests.' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/login', rateLimit, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required.' });
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return res.status(500).json({ error: 'Server misconfigured.' });
  const match = await bcrypt.compare(password, hash);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });
  const token = createSession();
  res.json({ token });
});

app.post('/api/search', rateLimit, async (req, res) => {
  const token = req.headers['x-session-token'];
  if (!isValidSession(token)) return res.status(401).json({ error: 'Not authenticated.' });
  const { product } = req.body || {};
  if (!product || product.trim().length < 2) return res.status(400).json({ error: 'Please provide a product name.' });
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });
  const systemPrompt = 'You are a Nepal e-commerce price expert. Return ONLY a JSON array of prices from Nepali stores (Daraz, SastoDeal, Gyapu, Electromandu, Kinaun, Samsung Plaza, Magic Mart, Thulo, OkDam, FatafatSewa). Each object: {store, url, price (NPR integer), original_price (or null), tags (array), in_stock, note}. Sort by price asc. 3-7 results. NPR prices only.';
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.15, max_tokens: 1200, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Find prices for: ' + product.trim() + ' in Nepal. JSON only.' }] })
    });
    const data = await groqRes.json();
    if (data.error) throw new Error(data.error.message || 'Groq error');
    let raw = (data.choices?.[0]?.message?.content || '').replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    res.json({ results: JSON.parse(match ? match[0] : raw) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Search failed.' });
  }
});

app.post('/api/offers', rateLimit, async (req, res) => {
  const token = req.headers['x-session-token'];
  if (!isValidSession(token)) return res.status(401).json({ error: 'Not authenticated.' });
  const GROQ_KEY = process.env.GROQ_API_KEY;
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.4, max_tokens: 800, messages: [{ role: 'user', content: 'Generate 14 hot deals from Nepal online stores. JSON array only, each: {store,product,original_price,sale_price,discount_pct,tag}' }] })
    });
    const data = await groqRes.json();
    let raw = (data.choices?.[0]?.message?.content||'').replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    res.json({ offers: JSON.parse(match ? match[0] : raw) });
  } catch(err) { res.status(500).json({ error: 'Could not load offers.' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('Nepal Price Finder running at http://localhost:' + PORT);
  console.log('API key secured in .env - never exposed to browser');
});

