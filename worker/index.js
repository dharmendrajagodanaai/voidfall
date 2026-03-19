/**
 * Cloudflare Worker — VOIDFALL Leaderboard API
 * In-memory for dev; replace with KV storage for production.
 *
 * Routes:
 *   GET  /scores?seed=<seed>       → top 10 scores
 *   POST /scores                   → submit { seed, platforms, timeMs, ghostFrames }
 *   GET  /ghosts?seed=<seed>       → top 5 ghost frame arrays
 */

// In-memory store (resets on worker restart — use KV for persistence)
const scores = [];
const ghosts = [];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (url.pathname === '/scores') {
      if (request.method === 'GET') {
        const seed = Number(url.searchParams.get('seed'));
        const filtered = scores
          .filter(s => !seed || s.seed === seed)
          .sort((a, b) => b.platforms - a.platforms || a.timeMs - b.timeMs)
          .slice(0, 10);
        return new Response(JSON.stringify(filtered), { headers });
      }

      if (request.method === 'POST') {
        const body = await request.json();
        scores.push({ seed: body.seed, platforms: body.platforms, timeMs: body.timeMs, ts: Date.now() });
        // Keep top 100 overall
        scores.sort((a, b) => b.platforms - a.platforms);
        scores.splice(100);
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
    }

    if (url.pathname === '/ghosts' && request.method === 'GET') {
      const seed = Number(url.searchParams.get('seed'));
      const filtered = ghosts
        .filter(g => g.seed === seed)
        .slice(0, 5)
        .map(g => g.frames);
      return new Response(JSON.stringify(filtered), { headers });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
