import * as THREE from 'three';

const RECORD_INTERVAL = 0.1; // seconds

export class GhostSystem {
  constructor(scene) {
    this.scene = scene;
    this.recording = false;
    this.frames = [];
    this._timer = 0;
    this._ghosts = []; // active ghost meshes
    this._ghostFrames = []; // array of frame arrays
    this._ghostTimers = [];
    this._ghostIndices = [];
  }

  startRecording() {
    this.recording = true;
    this.frames = [];
    this._timer = 0;
  }

  record(pos, vel, dt) {
    if (!this.recording) return;
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = RECORD_INTERVAL;
      this.frames.push({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y });
    }
  }

  stopRecording() {
    this.recording = false;
    return this.frames.slice();
  }

  playGhosts(allFrames) {
    // Clear old ghosts
    for (const g of this._ghosts) this.scene.remove(g);
    this._ghosts = [];
    this._ghostFrames = allFrames;
    this._ghostTimers = allFrames.map(() => 0);
    this._ghostIndices = allFrames.map(() => 0);

    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.3,
      wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    for (let i = 0; i < allFrames.length; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.visible = false;
      this.scene.add(mesh);
      this._ghosts.push(mesh);
    }
  }

  update(dt) {
    for (let i = 0; i < this._ghosts.length; i++) {
      const frames = this._ghostFrames[i];
      if (!frames || frames.length === 0) continue;

      this._ghostTimers[i] += dt;
      const idx = Math.min(
        Math.floor(this._ghostTimers[i] / RECORD_INTERVAL),
        frames.length - 1
      );
      this._ghostIndices[i] = idx;

      const f = frames[idx];
      const mesh = this._ghosts[i];
      mesh.visible = true;
      mesh.position.set(f.x, f.y, f.z);
      mesh.rotation.y += dt * 1.5;
    }
  }

  clear() {
    for (const g of this._ghosts) this.scene.remove(g);
    this._ghosts = [];
    this._ghostFrames = [];
  }
}
