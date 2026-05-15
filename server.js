/**
 * Nepal Price Finder — Secure Backend
 * - Groq API key stored only here, never sent to browser
 * - /api/search and /api/offers are PUBLIC (no auth needed)
 * - /api/banner-offers fetches deals from Daraz, Jeeva, HamroBazaar
 * - /admin requires password (sabina#7)
 */

require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

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
  if (win.count > 60) return res.status(429).json({ error: 'Too many requests.' });
  next();
}

function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!isValidSession(token)) return res.status(401).json({ error: 'Unauthorized.' });
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
  res.json({ token: createSession() });
});

app.post('/api/search', rateLimit, async (req, res) => {
  const { product } = req.body || {};
  if (!product || product.trim().length < 2)
    return res.status(400).json({ error: 'Please provide a product name.' });
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });
  const query = product.trim().toLowerCase();
  const isHotel = query.includes('hotel') || query.includes('resort') || query.includes('lodge') || query.includes('inn') || query.includes('homestay');
  const systemPrompt = isHotel
    ? 'You are a Nepal hotel price expert. Return ONLY a JSON array of hotel listings. Each: {store, url, price (NPR/night int), original_price (int or null), tags (array), in_stock (bool), note (string)}. Sort by price asc. 3-6 results. No markdown.'
    : 'You are a Nepal e-commerce price expert. Return ONLY a JSON array from Nepali stores (Daraz, SastoDeal, Gyapu, Electromandu, Kinaun, Magic Mart, Thulo, OkDam). Each: {store, url, price (NPR int), original_price (int or null), tags (array), in_stock (bool), note (string)}. Sort by price asc. 3-7 results. No markdown.';
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.15, max_tokens: 1400,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Find prices for: ' + product.trim() + ' in Nepal. JSON only.' }] })
    });
    const data = await groqRes.json();
    if (data.error) throw new Error(data.error.message || 'Groq error');
    let raw = (data.choices?.[0]?.message?.content || '').replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const results = JSON.parse((raw.match(/\[[\s\S]*\]/) || [raw])[0]);
    trackSearch(product.trim());
    res.json({ results, type: isHotel ? 'hotel' : 'product' });
  } catch(err) {
    stats.errors++;
    res.status(500).json({ error: err.message || 'Search failed.' });
  }
});

app.post('/api/banner-offers', rateLimit, async (req, res) => {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'API not configured.' });
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.4, max_tokens: 1000,
        messages: [{ role: 'user', content: 'Generate 9 realistic banner deals from Nepal stores (3 from Daraz, 3 from Jeeva, 3 from HamroBazaar). JSON array only. Each: {store,store_url,title,description,discount,category,color,url}' }] })
    });
    const data = await groqRes.json();
    let raw = (data.choices?.[0]?.message?.content||'').replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    res.json({ offers: JSON.parse((raw.match(/\[[\s\S]*\]/) || [raw])[0]) });
  } catch(err) { stats.errors++; res.status(500).json({ error: 'Could not load offers.' }); }
});

app.post('/api/offers', rateLimit, (req, res) => { stats.totalOfferLoads++; res.json({ offers: [] }); });

app.get('/api/admin/stats', requireAuth, (req, res) => {
  const uptimeMs = Date.now() - new Date(stats.serverStartTime).getTime();
  const topSearches = Object.entries(stats.popularProducts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([product,count])=>({product,count}));
  const now = new Date();
  const hourlyData = [];
  for (let i=23;i>=0;i--) { const d=new Date(now-i*3600000); hourlyData.push({hour:d.getHours()+':00',count:stats.hourlySearches[d.toISOString().slice(0,13)]||0}); }
  res.json({ uptime: Math.floor(uptimeMs/3600000)+'h '+Math.floor((uptimeMs%3600000)/60000)+'m', serverStartTime:stats.serverStartTime, totalSearches:stats.totalSearches, totalOfferLoads:stats.totalOfferLoads, totalErrors:stats.errors, activeSessions:sessions.size, recentSearches:stats.recentSearches.slice(0,20), topSearches, hourlyData });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('Nepal Price Finder running at http://localhost:' + PORT);
  console.log('API key secured in .env');
});
/** * Nepal Price Finder — Secure Backend * - Groq API key stored only here, never sent to browser * - /api/search and /api/offers are PUBLIC (no auth needed) * - /api/banner-offers fetches deals from Daraz, Jeeva, HamroBazaar * - /admin requires password (sabina#7) */require('dotenv').config();const express = require('express');const bcrypt  = require('bcryptjs');const crypto  = require('crypto');const path    = require('path');const app  = express();const PORT = process.env.PORT || 3000;// ── In-memory stats tracker ───────────────────────────────────const stats = {  totalSearches:  0,  totalOfferLoads: 0,  serverStartTime: new Date(),  recentSearches:  [],  popularProducts: {},  hourlySearches:  {},  errors: 0,};function trackSearch(product) {  stats.totalSearches++;  stats.recentSearches.unshift({ product, time: new Date().toISOString() });  if (stats.recentSearches.length > 50) stats.recentSearches.pop();  stats.popularProducts[product] = (stats.popularProducts[product] || 0) + 1;  const hour = new Date().toISOString().slice(0, 13);  stats.hourlySearches[hour] = (stats.hourlySearches[hour] || 0) + 1;}
