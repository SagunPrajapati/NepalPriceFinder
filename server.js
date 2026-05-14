/**
 * Nepal Price Finder — Secure Backend
 * - Groq API key stored only here, never sent to browser
 * - /api/search and /api/offers are PUBLIC (no auth needed)
 * - /api/login is available for future admin features
 * - Password verified via bcrypt hash (sabina#7)
 */

require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Session store (for future admin use) ─────────────────────
const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter — 60 requests per minute per IP
const rateLimits = new Map();
function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const win = rateLimits.get(ip) || { count: 0, start: now };
  if (now - win.start > 60000) { win.count = 0; win.start = now; }
  win.count++;
  rateLimits.set(ip, win);
  if (win.count > 60) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  next();
}

// ── Routes ────────────────────────────────────────────────────

// Health check (public)
app.get('/api/health', (req, res) => res.json({ ok: true, message: 'Nepal Price Finder API running' }));

// POST /api/login — password check (for admin/future use)
app.post('/api/login', rateLimit, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required.' });
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return res.status(500).json({ error: 'Server misconfigured.' });
  const match = await bcrypt.compare(password, hash);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });
  const token = createSession();
  res.json({ token, message: 'Authenticated successfully.' });
});

// POST /api/search — PUBLIC, no auth required, API key stays on server
app.post('/api/search', rateLimit, async (req, res) => {
  const { product } = req.body || {};
  if (!product || product.trim().length < 2) {
    return res.status(400).json({ error: 'Please provide a product name.' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured on server.' });

  const systemPrompt = 'You are a Nepal e-commerce price comparison expert. Return ONLY a valid JSON array of prices from Nepali online stores: Daraz (daraz.com.np), SastoDeal (sastodeal.com), Gyapu (gyapu.com), Electromandu (electromandu.com), Kinaun (kinaun.com), Samsung Plaza (samsungplaza.com.np), Magic Mart (magicmartnepal.com), Thulo.com, OkDam (okdam.com), FatafatSewa (fatafatsewa.com). Each object must have: store, url, price (NPR integer), original_price (integer or null), tags (array of strings), in_stock (boolean), note (one sentence). Sort by price ascending. 3-7 results. NPR prices only, not Indian Rupees. No markdown, no explanation, just the JSON array.';

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.15,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Find prices for: ' + product.trim() + ' in Nepal. JSON array only.' }
        ]
      })
    });

    const data = await groqRes.json();
    if (data.error) throw new Error(data.error.message || 'Groq API error');

    let raw = (data.choices?.[0]?.message?.content || '')
      .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    const results = JSON.parse(match ? match[0] : raw);
    res.json({ results });

  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message || 'Search failed. Please try again.' });
  }
});

// POST /api/offers — PUBLIC, loads live deals for ticker
app.post('/api/offers', rateLimit, async (req, res) => {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: 'Generate 14 realistic current hot deals from Nepal online stores (Daraz, SastoDeal, Gyapu, Electromandu, Kinaun, Magic Mart). JSON array only, no markdown. Each: {"store":"name","product":"short name max 5 words","original_price":45000,"sale_price":38000,"discount_pct":16,"tag":"SALE"}'
        }]
      })
    });

    const data = await groqRes.json();
Make /api/search and /api/offers public - remove session auth      .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    const offers = JSON.parse(match ? match[0] : raw);
    res.json({ offers });

  } catch(err) {
    res.status(500).json({ error: 'Could not load offers.' });
  }
});

// Catch-all → serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n Nepal Price Finder running at http://localhost:' + PORT);
  console.log(' API key secured in .env - never exposed to browser');
  console.log(' Frontend is PUBLIC - no login required\n');
});
