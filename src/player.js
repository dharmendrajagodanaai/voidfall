import * as THREE from 'three';

const TRAIL_LENGTH = 28;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.glow = null;
    this.trailLine = null;
    this._trailPositions = null;
    this._trailColors = null;
    this._trailHead = 0;

    // Input state
    this.input = {
      forward: false, backward: false, left: false, right: false,
      jumpHeld: false, jumpPressed: false,
      dash: false,
    };
    this._jumpPressedThisFrame = false;
    this._dashPressedThisFrame = false;

    this._setupInput();
    this._createMesh(scene);
    this._createTrail(scene);
  }

  _createMesh(scene) {
    // Player: IcosahedronGeometry with emissive glow
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x88aaff,
      emissiveIntensity: 2.5,
      metalness: 0.2,
      roughness: 0.3,
      wireframe: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    // Glow: larger icosahedron, additive
    const glowGeo = new THREE.IcosahedronGeometry(0.75, 1);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4466ff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.mesh.add(this.glow);

    // Point light attached to player
    this._light = new THREE.PointLight(0x6688ff, 3, 8);
    this.mesh.add(this._light);
  }

  _createTrail(scene) {
    const n = TRAIL_LENGTH;
    this._trailPositions = new Float32Array(n * 3);
    this._trailColors = new Float32Array(n * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._trailPositions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(this._trailColors, 3));
    geo.setDrawRange(0, n);

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    });
    this.trailLine = new THREE.Line(geo, mat);
    this.trailLine.frustumCulled = false;
    scene.add(this.trailLine);

    this._trailFull = new Array(n).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
    this._trailHead = 0;
    this._trailFilled = 0;
  }

  _setupInput() {
    const keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      keys.add(k);
      if (k === 'Space') { this._jumpPressedThisFrame = true; e.preventDefault(); }
      if (k === 'ShiftLeft' || k === 'ShiftRight') { this._dashPressedThisFrame = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      keys.delete(e.code);
    });
    this._keys = keys;
  }

  collectInput() {
    const k = this._keys;
    this.input.forward   = k.has('KeyW') || k.has('ArrowUp');
    this.input.backward  = k.has('KeyS') || k.has('ArrowDown');
    this.input.left      = k.has('KeyA') || k.has('ArrowLeft');
    this.input.right     = k.has('KeyD') || k.has('ArrowRight');
    this.input.jumpHeld  = k.has('Space');
    this.input.jumpPressed = this._jumpPressedThisFrame;
    this.input.dash      = this._dashPressedThisFrame;
    // Clear one-shot events
    this._jumpPressedThisFrame = false;
    this._dashPressedThisFrame = false;
  }

  update(physPos, physVel, dt, totalTime) {
    // Sync mesh position
    this.mesh.position.set(physPos.x, physPos.y, physPos.z);

    // Rotation based on movement
    const speed = Math.sqrt(physVel.x * physVel.x + physVel.z * physVel.z);
    if (speed > 0.5) {
      const targetYaw = Math.atan2(physVel.x, physVel.z);
      this.mesh.rotation.y = targetYaw;
    }
    this.mesh.rotation.x += physVel.y * 0.02;
    this.mesh.rotation.z += (physVel.x * 0.01);

    // Glow pulse
    const pulse = Math.sin(totalTime * 4) * 0.3 + 1;
    this.glow.material.opacity = 0.08 + pulse * 0.06;
    this._light.intensity = 2 + pulse;

    // Update trail
    this._updateTrail(physPos, totalTime);

    // Dash flash
    if (this.input.dash) {
      this.mesh.material.emissiveIntensity = 6;
    } else {
      this.mesh.material.emissiveIntensity = 2.5;
    }
  }

  _updateTrail(pos, t) {
    // Shift trail ring buffer
    const head = this._trailHead;
    this._trailFull[head] = { x: pos.x, y: pos.y, z: pos.z };
    this._trailHead = (head + 1) % TRAIL_LENGTH;
    if (this._trailFilled < TRAIL_LENGTH) this._trailFilled++;

    // Write to buffer (oldest → newest)
    const n = this._trailFilled;
    for (let i = 0; i < n; i++) {
      const srcIdx = (this._trailHead - n + i + TRAIL_LENGTH) % TRAIL_LENGTH;
      const p = this._trailFull[srcIdx];
      const t_ratio = i / (n - 1 || 1);
      this._trailPositions[i * 3]     = p.x;
      this._trailPositions[i * 3 + 1] = p.y;
      this._trailPositions[i * 3 + 2] = p.z;
      // Color: dim cyan → bright blue-white
      this._trailColors[i * 3]     = 0.2 + t_ratio * 0.8;
      this._trailColors[i * 3 + 1] = 0.4 + t_ratio * 0.5;
      this._trailColors[i * 3 + 2] = 1.0;
    }
    this.trailLine.geometry.attributes.position.needsUpdate = true;
    this.trailLine.geometry.attributes.color.needsUpdate = true;
    this.trailLine.geometry.setDrawRange(0, n);
  }

  setVisible(v) {
    this.mesh.visible = v;
    this.trailLine.visible = v;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.trailLine);
  }
}
