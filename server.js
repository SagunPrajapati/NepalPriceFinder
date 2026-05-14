/**
 * Nepal Price Finder — Secure Backend
 * - Groq API key never exposed to browser
 * - /api/search and /api/offers are PUBLIC
 * - /admin requires password (sabina#7)
 */

require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── In-memory stats tracker ───────────────────────────────────
const stats = {
  totalSearches: 0,
  totalOfferLoads: 0,
  serverStartTime: new Date(),
  recentSearches: [],       // last 50 searches
  popularProducts: {},      // product -> count
  popularCategories: {},    // category -> count
  hourlySearches: {},       // "YYYY-MM-DD HH" -> count
  errors: 0,
};

function trackSearch(product) {
  stats.totalSearches++;
  const entry = { product, time: new Date().toISOString(), };
  stats.recentSearches.unshift(entry);
  if (stats.recentSearches.length > 50) stats.recentSearches.pop();

  // Extract brand/category from product string
  const words = product.toLowerCase().split(' ');
  stats.popularProducts[product] = (stats.popularProducts[product] || 0) + 1;

  // Track hourly
  const hour = new Date().toISOString().slice(0, 13);
  stats.hourlySearches[hour] = (stats.hourlySearches[hour] || 0) + 1;
}

// ── Session store ─────────────────────────────────────────────
const sessions = new Map();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

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

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter
const rateLimits = new Map();
function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const win = rateLimits.get(ip) || { count: 0, start: now };
  if (now - win.start > 60000) { win.count = 0; win.start = now; }
  win.count++;
  rateLimits.set(ip, win);
  if (win.count > 60) return res.status(429).json({ error: 'Too many requests.' });
  next();
}

// Auth middleware for admin routes
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!isValidSession(token)) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  next();
}

// ── PUBLIC ROUTES ─────────────────────────────────────────────

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
  const { product } = req.body || {};
  if (!product || product.trim().length < 2)
    return res.status(400).json({ error: 'Please provide a product name.' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });

  const systemPrompt = 'You are a Nepal e-commerce price comparison expert. Return ONLY a valid JSON array of prices from Nepali online stores: Daraz (daraz.com.np), SastoDeal (sastodeal.com), Gyapu (gyapu.com), Electromandu (electromandu.com), Kinaun (kinaun.com), Samsung Plaza (samsungplaza.com.np), Magic Mart (magicmartnepal.com), Thulo.com, OkDam (okdam.com), FatafatSewa (fatafatsewa.com). Each object: {store, url, price (NPR int), original_price (int or null), tags (array), in_stock (bool), note (string)}. Sort by price asc. 3-7 results. NPR prices only. No markdown.';

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', temperature: 0.15, max_tokens: 1200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Find prices for: ' + product.trim() + ' in Nepal. JSON only.' }
        ]
      })
    });
    const data = await groqRes.json();
    if (data.error) throw new Error(data.error.message || 'Groq error');
    let raw = (data.choices?.[0]?.message?.content || '').replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    const results = JSON.parse(match ? match[0] : raw);
    trackSearch(product.trim());
    res.json({ results });
  } catch (err) {
    stats.errors++;
    res.status(500).json({ error: err.message || 'Search failed.' });
  }
});

app.post('/api/offers', rateLimit, async (req, res) => {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });
  stats.totalOfferLoads++;
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', temperature: 0.4, max_tokens: 800,
        messages: [{ role: 'user', content: 'Generate 14 hot deals from Nepal online stores (Daraz, SastoDeal, Gyapu, Electromandu, Kinaun, Magic Mart). JSON array only. Each: {store,product,original_price,sale_price,discount_pct,tag}' }]
      })
    });
    const data = await groqRes.json();
    let raw = (data.choices?.[0]?.message?.content||'').replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    res.json({ offers: JSON.parse(match ? match[0] : raw) });
  } catch(err) {
    stats.errors++;
    res.status(500).json({ error: 'Could not load offers.' });
  }
});

// ── ADMIN ROUTES (password protected) ────────────────────────

app.get('/api/admin/stats', requireAuth, (req, res) => {
  const uptimeMs = Date.now() - new Date(stats.serverStartTime).getTime();
  const uptimeHrs = Math.floor(uptimeMs / 3600000);
  const uptimeMins = Math.floor((uptimeMs % 3600000) / 60000);

  // Top 10 searches
  const topSearches = Object.entries(stats.popularProducts)
    .sort((a,b) => b[1] - a[1]).slice(0, 10)
    .map(([product, count]) => ({ product, count }));

  // Last 24h hourly chart data
  const now = new Date();
  const hourlyData = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now - i * 3600000);
    const key = d.toISOString().slice(0, 13);
    hourlyData.push({ hour: d.getHours() + ':00', count: stats.hourlySearches[key] || 0 });
  }

  res.json({
    uptime: uptimeHrs + 'h ' + uptimeMins + 'm',
    serverStartTime: stats.serverStartTime,
    totalSearches: stats.totalSearches,
    totalOfferLoads: stats.totalOfferLoads,
    totalErrors: stats.errors,
    activeSessions: sessions.size,
    recentSearches: stats.recentSearches.slice(0, 20),
    topSearches,
    hourlyData,
  });
});

// Serve admin panel HTML
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Catch-all → frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('\n Nepal Price Finder running at http://localhost:' + PORT);
  console.log(' Admin panel: http://localhost:' + PORT + '/admin');
  console.log(' API key secured — never exposed to browser\n');
});
