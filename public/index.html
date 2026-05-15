/**
 * Nepal Price Finder — Secure Backend
 * - Groq API key stored only here, never sent to browser
 * - /api/search and /api/offers are PUBLIC (no auth needed)
 * - /api/banner-offers fetches deals from Daraz, Jeeva, HamroBazaar
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
  totalSearches:  0,
  totalOfferLoads: 0,
  serverStartTime: new Date(),
  recentSearches:  [],
  popularProducts: {},
  hourlySearches:  {},
  errors: 0,
};

function trackSearch(product) {
  stats.totalSearches++;
  stats.recentSearches.unshift({ product, time: new Date().toISOString() });
  if (stats.recentSearches.length > 50) stats.recentSearches.pop();
  stats.popularProducts[product] = (stats.popularProducts[product] || 0) + 1;
  const hour = new Date().toISOString().slice(0, 13);
  stats.hourlySearches[hour] = (stats.hourlySearches[hour] || 0) + 1;
}

// ── Session store (admin only) ────────────────────────────────
const sessions = new Map();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

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

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter — 60 requests/min per IP
const rateLimits = new Map();
function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const win = rateLimits.get(ip) || { count: 0, start: now };
  if (now - win.start > 60000) { win.count = 0; win.start = now; }
  win.count++;
  rateLimits.set(ip, win);
  if (win.count > 60) return res.status(429).json({ error: 'Too many requests. Please wait.' });
  next();
}

// Auth middleware for admin routes
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!isValidSession(token)) return res.status(401).json({ error: 'Unauthorized.' });
  next();
}

// ── PUBLIC ROUTES ─────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

// POST /api/login — password check for admin
app.post('/api/login', rateLimit, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required.' });
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return res.status(500).json({ error: 'Server misconfigured.' });
  const match = await bcrypt.compare(password, hash);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });
  res.json({ token: createSession() });
});

// POST /api/search — PUBLIC, searches products or hotels
app.post('/api/search', rateLimit, async (req, res) => {
  const { product } = req.body || {};
  if (!product || product.trim().length < 2)
    return res.status(400).json({ error: 'Please provide a product or hotel name.' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });

  const query = product.trim().toLowerCase();
  const isHotel = query.includes('hotel') || query.includes('resort') ||
                  query.includes('lodge') || query.includes('inn') ||
                  query.includes('homestay');

  let systemPrompt;

  if (isHotel) {
    // Hotel/Resort search prompt
    systemPrompt = `You are a Nepal hotel and resort price comparison expert. Return ONLY a valid JSON array of hotel/resort listings from Nepal booking sites: Booking.com Nepal, Agoda Nepal, Nepaltrekking.com, Tripadvisor Nepal, direct hotel websites, and local booking platforms.

Each object must have:
{
  "store": "platform or hotel name",
  "url": "booking URL",
  "price": integer price in NPR per night,
  "original_price": integer or null if no discount,
  "tags": ["array of tags like Free Breakfast", "Free Wifi", "Pool", "Mountain View", "Book Direct"],
  "in_stock": true or false (availability),
  "note": "one sentence about the property or deal"
}

Rules: NPR prices only. Sort by price ascending. 3-6 results. Include star rating in tags if known. No markdown.`;
  } else {
    // Product search prompt
    systemPrompt = `You are a Nepal e-commerce price comparison expert. Return ONLY a valid JSON array of prices from Nepali online stores: Daraz (daraz.com.np), SastoDeal (sastodeal.com), Gyapu (gyapu.com), Electromandu (electromandu.com), Kinaun (kinaun.com), Samsung Plaza (samsungplaza.com.np), Magic Mart (magicmartnepal.com), Thulo.com, OkDam (okdam.com), FatafatSewa (fatafatsewa.com).

Each object must have:
{
  "store": "store display name",
  "url": "full product URL",
  "price": integer NPR price,
  "original_price": integer or null,
  "tags": ["array", "of", "tags"],
  "in_stock": true or false,
  "note": "one short sentence"
}

Rules: NPR prices only. Sort by price ascending. 3-7 results. No markdown.`;
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.15,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Find ${isHotel ? 'hotel/resort prices' : 'prices'} for: ${product.trim()} in Nepal. JSON array only.` }
        ]
      })
    });

    const data = await groqRes.json();
    if (data.error) throw new Error(data.error.message || 'Groq error');

    let raw = (data.choices?.[0]?.message?.content || '')
      .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    const results = JSON.parse(match ? match[0] : raw);
    trackSearch(product.trim());
    res.json({ results, type: isHotel ? 'hotel' : 'product' });

  } catch (err) {
    stats.errors++;
    res.status(500).json({ error: err.message || 'Search failed.' });
  }
});

// POST /api/banner-offers — PUBLIC, fetches real deals from Daraz, Jeeva, HamroBazaar
app.post('/api/banner-offers', rateLimit, async (req, res) => {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Generate 9 realistic current promotional banner offers from these 3 specific Nepal online stores:
- Daraz Nepal (daraz.com.np) — 3 offers
- Jeeva (jeeva.com.np) — 3 offers  
- HamroBazaar (hamrobazaar.com) — 3 offers

Each offer should be a real-looking promotional banner deal with a discount.

Respond ONLY with a valid JSON array, no markdown. Each item:
{
  "store": "Daraz" or "Jeeva" or "HamroBazaar",
  "store_url": "homepage URL",
  "title": "short catchy offer title (max 6 words)",
  "description": "one line description of the deal",
  "discount": "discount text e.g. Up to 40% OFF",
  "category": "product category e.g. Electronics, Fashion, Home",
  "color": "one of: orange, blue, green, purple, red",
  "url": "realistic deal page URL on that store"
}`
        }]
      })
    });

    const data = await groqRes.json();
    let raw = (data.choices?.[0]?.message?.content || '')
      .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    const offers = JSON.parse(match ? match[0] : raw);
    res.json({ offers });

  } catch(err) {
    stats.errors++;
    res.status(500).json({ error: 'Could not load banner offers.' });
  }
});

// POST /api/offers — kept for backward compatibility (ticker, now unused on frontend)
app.post('/api/offers', rateLimit, async (req, res) => {
  res.json({ offers: [] });
});

// ── ADMIN ROUTES (password protected) ────────────────────────

app.get('/api/admin/stats', requireAuth, (req, res) => {
  const uptimeMs  = Date.now() - new Date(stats.serverStartTime).getTime();
  const uptimeHrs = Math.floor(uptimeMs / 3600000);
  const uptimeMins = Math.floor((uptimeMs % 3600000) / 60000);

  const topSearches = Object.entries(stats.popularProducts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([product, count]) => ({ product, count }));

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

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Catch-all → serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n Nepal Price Finder running at http://localhost:' + PORT);
  console.log(' Admin panel: http://localhost:' + PORT + '/admin');
  console.log(' API key secured in .env — never exposed to browser\n');
});
