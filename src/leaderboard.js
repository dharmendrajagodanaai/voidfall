// Leaderboard — localStorage mock (no real backend needed)
// Stub for Cloudflare Worker API

const LS_KEY = 'voidfall_scores';
const LS_GHOST_KEY = 'voidfall_ghosts';

export class Leaderboard {
  constructor() {
    this._scores = this._load();
    this._ghosts = this._loadGhosts();
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch { return []; }
  }

  _loadGhosts() {
    try {
      return JSON.parse(localStorage.getItem(LS_GHOST_KEY) || '[]');
    } catch { return []; }
  }

  _save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this._scores)); } catch {}
  }

  _saveGhosts() {
    try { localStorage.setItem(LS_GHOST_KEY, JSON.stringify(this._ghosts)); } catch {}
  }

  submit(seed, platforms, timeMs, ghostFrames) {
    // Add score
    this._scores.push({ seed, platforms, timeMs, ts: Date.now() });
    // Keep top 20
    this._scores.sort((a, b) => b.platforms - a.platforms || a.timeMs - b.timeMs);
    this._scores = this._scores.slice(0, 20);
    this._save();

    // Store ghost (top 5 per seed)
    const seedGhosts = this._ghosts.filter(g => g.seed === seed);
    seedGhosts.push({ seed, platforms, frames: ghostFrames });
    seedGhosts.sort((a, b) => b.platforms - a.platforms);
    const other = this._ghosts.filter(g => g.seed !== seed);
    this._ghosts = [...other, ...seedGhosts.slice(0, 5)];
    this._saveGhosts();
  }

  getTopScores(seed, limit = 10) {
    return this._scores
      .filter(s => s.seed === seed || !seed)
      .slice(0, limit);
  }

  getGhosts(seed) {
    return this._ghosts
      .filter(g => g.seed === seed)
      .map(g => g.frames);
  }

  getPersonalBest(seed) {
    const s = this._scores.filter(s => s.seed === seed || !seed);
    return s.length ? s[0].platforms : 0;
  }
}
