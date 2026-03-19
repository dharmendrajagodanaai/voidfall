import * as THREE from 'three';

const CAMERA_DISTANCE = 12;
const CAMERA_HEIGHT = 5;
const LERP_SPEED = 8;

export class GameCamera {
  constructor(renderer) {
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 400);
    this.yaw   = 0;   // horizontal orbit (radians)
    this.pitch = 0.3; // vertical orbit (0 = horizontal, π/2 = top-down)
    this._target = new THREE.Vector3(0, 0, 0);
    this._smoothTarget = new THREE.Vector3(0, 0, 0);

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    this._setupMouse(renderer.domElement);
    this._setupResize();
  }

  _setupMouse(canvas) {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this._dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      }
    });
    window.addEventListener('mouseup', () => { this._dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.yaw   -= dx * 0.006;
      this.pitch += dy * 0.004;
      this.pitch = Math.max(0.05, Math.min(Math.PI * 0.45, this.pitch));
    });

    // Touch support
    let lastTouchX = 0, lastTouchY = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        this.yaw   -= dx * 0.005;
        this.pitch += dy * 0.004;
        this.pitch = Math.max(0.05, Math.min(Math.PI * 0.45, this.pitch));
      }
    }, { passive: true });

    // Right-click doesn't open context menu
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _setupResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  // The camera yaw is what player uses for movement direction
  getYaw() { return this.yaw; }

  update(dt, targetPos) {
    // Smooth follow target
    this._target.set(targetPos.x, targetPos.y, targetPos.z);
    this._smoothTarget.lerp(this._target, Math.min(1, LERP_SPEED * dt));

    // Orbit position
    const sinYaw   = Math.sin(this.yaw);
    const cosYaw   = Math.cos(this.yaw);
    const sinPitch = Math.sin(this.pitch);
    const cosPitch = Math.cos(this.pitch);

    const dist = CAMERA_DISTANCE;
    const cx = this._smoothTarget.x + sinYaw * cosPitch * dist;
    const cy = this._smoothTarget.y + sinPitch * dist + CAMERA_HEIGHT * 0.3;
    const cz = this._smoothTarget.z + cosYaw * cosPitch * dist;

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(
      this._smoothTarget.x,
      this._smoothTarget.y + 1,
      this._smoothTarget.z
    );
  }
}
