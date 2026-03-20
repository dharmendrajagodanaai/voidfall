import * as THREE from 'three';
import { PlatformPool } from './platform.js';

// Mulberry32 seeded RNG
class SeededRandom {
  constructor(seed) { this.state = seed >>> 0; }
  next() {
    this.state |= 0;
    this.state = (this.state + 0x6D2B79F5) | 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  choose(arr) { return arr[Math.floor(this.next() * arr.length)]; }
}

export function getDailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

const TOTAL_PLATFORMS = 100;
const CHUNK_AHEAD = 35;  // generate this many platforms ahead
const MAX_VISIBLE = 50;

// Platform type weights by difficulty tier
const TYPE_WEIGHTS = [
  // tier 0 (easy)
  ['solid','solid','solid','solid','solid','checkpoint'],
  // tier 1
  ['solid','solid','solid','ice','moving','crumble'],
  // tier 2
  ['solid','ice','ice','crumble','moving','bounce'],
  // tier 3
  ['solid','ice','crumble','crumble','moving','bounce'],
];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.pool = new PlatformPool(scene, 60);
    this.generatedCount = 0;
    this.platformData = []; // blueprint for all platforms
    this.spawnedIndex = {}; // platformIndex → Platform object
    this.checkpoints = new Set();
    this.beaconMesh = null;
    this.beaconLight = null;
    this.beaconBeam = null;
    this.totalTime = 0;
    this._collectiblesGroup = null;
  }

  init(seed) {
    this.rng = new SeededRandom(seed);
    this.platformData = [];
    this.spawnedIndex = {};
    this.generatedCount = 0;
    this.checkpoints.clear();
    this._sceneExtras = this._sceneExtras || [];
    this._generateBlueprint();
    this._createBeacon();
    if (!this._fogCreated) {
      this._createVoidFog();
      this._createStarfield();
      this._fogCreated = true;
    }
    this._createCollectibles();
  }

  _generateBlueprint() {
    // Platform 0: start platform (large, safe)
    this.platformData.push({
      pos: { x: 0, y: 0, z: 0 },
      size: { x: 7, y: 0.5, z: 7 },
      type: 'checkpoint',
      index: 0,
    });
    this.checkpoints.add(0);

    let prevPos = { x: 0, y: 0, z: 0 };

    for (let i = 1; i <= TOTAL_PLATFORMS; i++) {
      const isCheckpoint = (i % 20 === 0);
      const difficulty = Math.min(3, Math.floor(i / 25));
      const weights = TYPE_WEIGHTS[difficulty];

      let type = isCheckpoint ? 'checkpoint' : this.rng.choose(weights);
      if (isCheckpoint) this.checkpoints.add(i);

      // Size scales with difficulty
      const baseW = Math.max(1.5, 4.0 - i * 0.02 + this.rng.range(-0.5, 0.5));
      const baseD = Math.max(1.5, 3.5 - i * 0.015 + this.rng.range(-0.5, 0.5));
      const sw = isCheckpoint ? 5 : baseW;
      const sd = isCheckpoint ? 5 : baseD;

      // Position
      const gap = this.rng.range(3, 3 + Math.min(4, 2 + difficulty));
      const lateralOffset = this.rng.range(-4, 4);
      const heightDiff = this.rng.range(-2.4, 3.6);

      const pz = prevPos.z - gap - sd * 0.5; // going in -Z direction
      const px = Math.max(-8, Math.min(8, prevPos.x + lateralOffset));
      const py = Math.max(-4, Math.min(12, prevPos.y + heightDiff));

      // Moving platform config
      const moveAxis = this.rng.next() > 0.5 ? 'x' : 'z';
      const moveAmp = this.rng.range(1.5, 4);
      const moveFreq = this.rng.range(0.5, 1.5);
      const movePhase = this.rng.range(0, Math.PI * 2);

      this.platformData.push({
        pos: { x: px, y: py, z: pz },
        size: { x: sw, y: 0.4, z: sd },
        type,
        index: i,
        moveAxis, moveAmp, moveFreq, movePhase,
      });

      prevPos = { x: px, y: py, z: pz };
    }
  }

  _spawnPlatform(data) {
    if (this.spawnedIndex[data.index]) return;

    const plat = this.pool.get(data.pos, data.size, data.type, data.index);
    if (data.type === 'moving') {
      plat.moveAxis = data.moveAxis;
      plat.moveAmplitude = data.moveAmp;
      plat.moveFrequency = data.moveFreq;
      plat.movePhase = data.movePhase;
    }
    this.spawnedIndex[data.index] = plat;
  }

  _createBeacon() {
    // Goal beacon at far end
    const lastPlat = this.platformData[this.platformData.length - 1];
    const bx = lastPlat.pos.x;
    const by = lastPlat.pos.y + 0.5;
    const bz = lastPlat.pos.z - 4;

    // Base cylinder
    const baseGeo = new THREE.CylinderGeometry(0.8, 1.2, 2, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 1.2,
      metalness: 0.8, roughness: 0.2,
    });
    this.beaconMesh = new THREE.Mesh(baseGeo, baseMat);
    this.beaconMesh.position.set(bx, by + 1, bz);
    this.scene.add(this.beaconMesh);

    // Vertical beam (elongated box, additive blend)
    const beamGeo = new THREE.CylinderGeometry(0.15, 0.5, 60, 8);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beaconBeam = new THREE.Mesh(beamGeo, beamMat);
    this.beaconBeam.position.set(bx, by + 32, bz);
    this.scene.add(this.beaconBeam);

    // Point light
    this.beaconLight = new THREE.PointLight(0xffaa00, 4, 25);
    this.beaconLight.position.set(bx, by + 3, bz);
    this.scene.add(this.beaconLight);

    this.beaconPos = { x: bx, y: by + 1, z: bz };
  }

  _createVoidFog() {
    // Animated noise plane far below
    const fogGeo = new THREE.PlaneGeometry(300, 300, 1, 1);
    const fogMat = new THREE.MeshBasicMaterial({
      color: 0x110022, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const fog = new THREE.Mesh(fogGeo, fogMat);
    fog.rotation.x = -Math.PI / 2;
    fog.position.y = -28;
    this.scene.add(fog);

    // Ember particles drifting up
    const count = 120;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 60;
      pos[i*3+1] = Math.random() * 20 - 30;
      pos[i*3+2] = (Math.random() - 0.5) * 60;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xff4400, size: 0.12, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._emberParticles = new THREE.Points(pGeo, pMat);
    this._emberPositions = pos;
    this._emberCount = count;
    this.scene.add(this._emberParticles);
  }

  _createStarfield() {
    const count = 800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 180 + Math.random() * 20;
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi);
      pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaabbff, size: 0.4, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const stars = new THREE.Points(geo, mat);
    this.scene.add(stars);
  }

  _createCollectibles() {
    // InstancedMesh for collectibles (1 draw call)
    const cCount = 30;
    const geo = new THREE.OctahedronGeometry(0.22, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x88aaff, emissiveIntensity: 1.5,
      metalness: 0.4, roughness: 0.2,
    });
    this._collectiblesIM = new THREE.InstancedMesh(geo, mat, cCount);
    this._collectiblesIM.castShadow = false;
    this._collectibleData = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < cCount; i++) {
      const pIdx = this.rng.int(1, TOTAL_PLATFORMS - 5);
      const pd = this.platformData[pIdx];
      if (!pd) continue;
      const cx = pd.pos.x + this.rng.range(-pd.size.x * 0.3, pd.size.x * 0.3);
      const cy = pd.pos.y + 1.2;
      const cz = pd.pos.z + this.rng.range(-pd.size.z * 0.3, pd.size.z * 0.3);
      this._collectibleData.push({ x: cx, y: cy, z: cz, phase: this.rng.range(0, Math.PI * 2), collected: false });
      dummy.position.set(cx, cy, cz);
      dummy.updateMatrix();
      this._collectiblesIM.setMatrixAt(i, dummy.matrix);
    }
    this._collectiblesIM.instanceMatrix.needsUpdate = true;
    this.scene.add(this._collectiblesIM);
    this._collectiblesGroup = this._collectiblesIM;
    this._dummy = dummy;
  }

  update(playerPos, dt) {
    this.totalTime += dt;

    // Spawn platforms near or ahead of player
    const playerZ = playerPos.z;
    for (const data of this.platformData) {
      if (this.spawnedIndex[data.index]) continue;
      const dz = playerZ - data.pos.z; // positive = platform is ahead (negative Z direction)
      if (dz > -30 && dz < CHUNK_AHEAD * 6) {
        this._spawnPlatform(data);
      }
    }

    // Despawn platforms far behind player (> 90 units behind)
    for (const [idx, plat] of Object.entries(this.spawnedIndex)) {
      if (!plat || !plat.active) {
        delete this.spawnedIndex[idx];
        continue;
      }
      const distBehind = playerZ - plat.position.z; // negative = behind player
      if (distBehind < -90) {
        this.pool.release(plat);
        delete this.spawnedIndex[idx];
      }
    }

    // Update pool
    this.pool.update(dt, this.totalTime);

    // Beacon pulse
    if (this.beaconMesh) {
      const pulse = Math.sin(this.totalTime * 3) * 0.5 + 1.5;
      this.beaconMesh.material.emissiveIntensity = pulse;
      this.beaconBeam.material.opacity = 0.12 + Math.sin(this.totalTime * 2) * 0.06;
      this.beaconMesh.rotation.y = this.totalTime * 0.8;
    }

    // Ember particles drift up
    if (this._emberParticles) {
      const pos = this._emberPositions;
      for (let i = 0; i < this._emberCount; i++) {
        pos[i*3+1] += 0.04;
        if (pos[i*3+1] > -8) {
          pos[i*3]   = playerPos.x + (Math.random() - 0.5) * 60;
          pos[i*3+1] = playerPos.y - 30;
          pos[i*3+2] = playerPos.z + (Math.random() - 0.5) * 60;
        }
      }
      this._emberParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Animate collectibles
    if (this._collectiblesIM && this._collectibleData) {
      const dummy = this._dummy;
      for (let i = 0; i < this._collectibleData.length; i++) {
        const c = this._collectibleData[i];
        if (c.collected) continue;
        dummy.position.set(c.x, c.y + Math.sin(this.totalTime * 2 + c.phase) * 0.15, c.z);
        dummy.rotation.y = this.totalTime + c.phase;
        dummy.updateMatrix();
        this._collectiblesIM.setMatrixAt(i, dummy.matrix);
      }
      this._collectiblesIM.instanceMatrix.needsUpdate = true;
    }
  }

  getActivePlatforms() {
    return this.pool.getActivePlatforms();
  }

  getPlatformCount() {
    return TOTAL_PLATFORMS;
  }

  getBeaconPos() {
    return this.beaconPos;
  }

  checkCollectibles(playerPos) {
    if (!this._collectibleData) return 0;
    let collected = 0;
    for (let i = 0; i < this._collectibleData.length; i++) {
      const c = this._collectibleData[i];
      if (c.collected) continue;
      const dx = c.x - playerPos.x, dy = c.y - playerPos.y, dz = c.z - playerPos.z;
      if (dx*dx + dy*dy + dz*dz < 0.8) {
        c.collected = true;
        // Hide instance
        this._dummy.position.set(0, -999, 0);
        this._dummy.updateMatrix();
        this._collectiblesIM.setMatrixAt(i, this._dummy.matrix);
        this._collectiblesIM.instanceMatrix.needsUpdate = true;
        collected++;
      }
    }
    return collected;
  }

  getCurrentPlatformIndex(playerPos) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (const [idx, plat] of Object.entries(this.spawnedIndex)) {
      if (!plat) continue;
      const dx = plat.position.x - playerPos.x;
      const dy = plat.position.y - playerPos.y + plat.halfSize.y;
      const dz = plat.position.z - playerPos.z;
      const d = dx*dx + dy*dy*0.5 + dz*dz;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = Number(idx);
      }
    }
    return nearest;
  }

  reset(seed) {
    // Clear all active platforms
    for (const plat of this.pool.getActivePlatforms()) {
      plat.deactivate();
    }
    this.pool.active = [];
    this.spawnedIndex = {};
    this.generatedCount = 0;
    this.platformData = [];
    this.checkpoints.clear();
    this.totalTime = 0;

    if (this.beaconMesh) {
      this.scene.remove(this.beaconMesh);
      this.scene.remove(this.beaconBeam);
      this.scene.remove(this.beaconLight);
    }
    if (this._collectiblesGroup) this.scene.remove(this._collectiblesGroup);

    this.init(seed);
  }

  getStartPos() {
    const first = this.platformData[0];
    return { x: first.pos.x, y: first.pos.y + 2.5, z: first.pos.z };
  }
}
