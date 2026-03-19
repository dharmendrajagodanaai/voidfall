import { DASH_COOLDOWN } from './physics.js';

export class UI {
  constructor() {
    this._dist    = document.getElementById('distance');
    this._spd     = document.getElementById('speed-display');
    this._dashFill = document.getElementById('dash-bar-fill');
    this._ckMsg   = document.getElementById('checkpoint-msg');
    this._deathEl = document.getElementById('death-screen');
    this._winEl   = document.getElementById('win-screen');
    this._statDist = document.getElementById('stat-dist');
    this._statPb   = document.getElementById('stat-pb');
    this._lbEntries = document.getElementById('lb-entries');
    this._winPlat  = document.getElementById('win-plat');
    this._winTime  = document.getElementById('win-time');

    this._ckTimeout = null;
    this._prevPlatform = -1;

    document.getElementById('retry-btn').addEventListener('click', () => {
      if (window.gameRestart) window.gameRestart();
    });
    document.getElementById('win-btn').addEventListener('click', () => {
      if (window.gameRestart) window.gameRestart();
    });
  }

  update(platformIndex, speed, dashCooldown) {
    if (this._dist) this._dist.textContent = String(platformIndex);
    if (this._spd)  this._spd.textContent  = speed.toFixed(1) + ' u/s';

    // Dash bar: 0 when ready, fills as cooldown ticks
    const filled = dashCooldown <= 0 ? 1 : 1 - (dashCooldown / DASH_COOLDOWN);
    if (this._dashFill) this._dashFill.style.width = (filled * 100).toFixed(1) + '%';
  }

  flashCheckpoint() {
    if (!this._ckMsg) return;
    this._ckMsg.style.opacity = '1';
    if (this._ckTimeout) clearTimeout(this._ckTimeout);
    this._ckTimeout = setTimeout(() => {
      this._ckMsg.style.opacity = '0';
    }, 1500);
  }

  showDeath(platforms, pb, scores) {
    if (this._deathEl) {
      this._deathEl.style.display = 'flex';
      if (this._statDist) this._statDist.textContent = platforms;
      if (this._statPb)   this._statPb.textContent   = pb;
      this._renderLeaderboard(scores);
    }
  }

  showWin(platforms, timeMs) {
    if (this._winEl) {
      this._winEl.style.display = 'flex';
      const secs = Math.floor(timeMs / 1000);
      const m = Math.floor(secs / 60), s = secs % 60;
      if (this._winPlat) this._winPlat.textContent = platforms;
      if (this._winTime) this._winTime.textContent = `${m}:${String(s).padStart(2,'0')}`;
    }
  }

  hideDeath()  { if (this._deathEl) this._deathEl.style.display = 'none'; }
  hideWin()    { if (this._winEl)   this._winEl.style.display   = 'none'; }

  _renderLeaderboard(scores) {
    if (!this._lbEntries) return;
    this._lbEntries.innerHTML = '';
    scores.slice(0, 10).forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const secs = Math.floor(s.timeMs / 1000);
      const m = Math.floor(secs / 60), sec = secs % 60;
      row.innerHTML = `<span class="lb-rank">${i+1}</span><span>${s.platforms} platforms</span><span>${m}:${String(sec).padStart(2,'0')}</span>`;
      this._lbEntries.appendChild(row);
    });
    if (scores.length === 0) {
      this._lbEntries.innerHTML = '<div class="lb-row" style="opacity:0.3;justify-content:center">no runs yet</div>';
    }
  }
}
