// Custom minimal physics — no external libraries
const GRAVITY = -20;
const JUMP_VELOCITY = 12;
const JUMP_VELOCITY_MAX = 16;
const DASH_SPEED = 25;
export const DASH_COOLDOWN = 2;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.15;
const GROUND_ACCEL = 32;
const AIR_ACCEL = 18;
const GROUND_FRICTION = 9;
const AIR_FRICTION = 1.2;
const ICE_FRICTION = 1.5;
export const PLAYER_RADIUS = 0.5;
export const VOID_THRESHOLD = -30;
const MAX_HSPEED = 18;

export class PlayerPhysics {
  constructor() {
    this.position = { x: 0, y: 3, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.standingPlatform = null;
    this.prevStandingPlatform = null;
    this.coyoteTimer = 0;
    this.jumpBuffer = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.isJumping = false;
    this.jumpHoldTime = 0;
    this.onIce = false;
    this.justBounced = false;
    this.bounceTimer = 0;
  }

  reset(x, y, z) {
    this.position.x = x; this.position.y = y; this.position.z = z;
    this.velocity.x = 0; this.velocity.y = 0; this.velocity.z = 0;
    this.grounded = false;
    this.standingPlatform = null;
    this.prevStandingPlatform = null;
    this.coyoteTimer = 0;
    this.jumpBuffer = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.isJumping = false;
    this.jumpHoldTime = 0;
    this.onIce = false;
    this.justBounced = false;
    this.bounceTimer = 0;
  }

  update(dt, input, platforms, cameraYaw) {
    dt = Math.min(dt, 0.05); // cap dt to prevent tunneling

    // --- Input direction relative to camera ---
    let mx = 0, mz = 0;
    if (input.forward)  mz -= 1;
    if (input.backward) mz += 1;
    if (input.left)     mx -= 1;
    if (input.right)    mx += 1;

    // Rotate by camera yaw
    const cos = Math.cos(cameraYaw), sin = Math.sin(cameraYaw);
    const moveX = mx * cos - mz * sin;
    const moveZ = mx * sin + mz * cos;
    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    let ndx = 0, ndz = 0;
    if (moveLen > 0.01) { ndx = moveX / moveLen; ndz = moveZ / moveLen; }

    // --- Moving platform carry ---
    if (this.standingPlatform && this.standingPlatform.type === 'moving') {
      const platVel = this.standingPlatform.getVelocity();
      this.position.x += platVel.x * dt;
      this.position.z += platVel.z * dt;
    }

    // --- Dash ---
    if (input.dash && this.dashCooldown <= 0 && moveLen > 0.01) {
      this.velocity.x = ndx * DASH_SPEED;
      this.velocity.z = ndz * DASH_SPEED;
      this.velocity.y = Math.max(this.velocity.y, 2);
      this.dashCooldown = DASH_COOLDOWN;
      this.dashTimer = 0.18;
    }
    if (this.dashTimer > 0) this.dashTimer -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;

    // --- Horizontal accel/friction ---
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const frictionMult = this.onIce ? ICE_FRICTION : (this.grounded ? GROUND_FRICTION : AIR_FRICTION);

    this.velocity.x += ndx * accel * dt;
    this.velocity.z += ndz * accel * dt;

    // Friction only when not dashing
    if (this.dashTimer <= 0) {
      const decay = Math.max(0, 1 - frictionMult * dt);
      this.velocity.x *= decay;
      this.velocity.z *= decay;
    }

    // Clamp horizontal speed
    const hSpd = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    if (hSpd > MAX_HSPEED) {
      const s = MAX_HSPEED / hSpd;
      this.velocity.x *= s; this.velocity.z *= s;
    }

    // --- Coyote time ---
    const wasGrounded = this.grounded;
    this.grounded = false;
    this.prevStandingPlatform = this.standingPlatform;
    this.standingPlatform = null;
    this.onIce = false;

    if (wasGrounded) this.coyoteTimer = COYOTE_TIME;
    else this.coyoteTimer -= dt;

    // --- Jump buffer ---
    if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer -= dt;

    // --- Gravity ---
    if (!this.justBounced) {
      this.velocity.y += GRAVITY * dt;
    }
    if (this.bounceTimer > 0) {
      this.bounceTimer -= dt;
      if (this.bounceTimer <= 0) this.justBounced = false;
    }

    // --- Apply velocity ---
    const stepX = this.velocity.x * dt;
    const stepY = this.velocity.y * dt;
    const stepZ = this.velocity.z * dt;

    this.position.x += stepX;
    this.position.y += stepY;
    this.position.z += stepZ;

    // --- Collision detection ---
    const PR = PLAYER_RADIUS;
    for (const plat of platforms) {
      if (!plat.active || plat.dissolveProgress >= 0.95) continue;

      const pp = plat.position;
      const hs = plat.halfSize;

      // Platform AABB
      const pMinX = pp.x - hs.x, pMaxX = pp.x + hs.x;
      const pMinY = pp.y - hs.y, pMaxY = pp.y + hs.y;
      const pMinZ = pp.z - hs.z, pMaxZ = pp.z + hs.z;

      // Player AABB
      const plMinX = this.position.x - PR, plMaxX = this.position.x + PR;
      const plMinY = this.position.y - PR, plMaxY = this.position.y + PR;
      const plMinZ = this.position.z - PR, plMaxZ = this.position.z + PR;

      // Broad-phase check
      if (plMaxX <= pMinX || plMinX >= pMaxX) continue;
      if (plMaxY <= pMinY || plMinY >= pMaxY) continue;
      if (plMaxZ <= pMinZ || plMinZ >= pMaxZ) continue;

      // Penetration depths
      const ovX = Math.min(plMaxX - pMinX, pMaxX - plMinX);
      const ovY = Math.min(plMaxY - pMinY, pMaxY - plMinY);
      const ovZ = Math.min(plMaxZ - pMinZ, pMaxZ - plMinZ);

      // Resolve on minimum penetration axis
      if (ovY <= ovX && ovY <= ovZ) {
        // Vertical
        const prevBottom = this.position.y - PR - stepY;
        const abovePrevFrame = prevBottom >= pMaxY - 0.1;

        if (this.position.y > pp.y && abovePrevFrame) {
          // Land on top
          this.position.y = pMaxY + PR;
          if (this.velocity.y < 0) {
            if (plat.type === 'bounce') {
              this.velocity.y = JUMP_VELOCITY * 2.2;
              this.justBounced = true;
              this.bounceTimer = 0.15;
              this.isJumping = false;
            } else {
              this.velocity.y = 0;
            }
          }
          if (plat.type !== 'bounce') {
            this.grounded = true;
            this.standingPlatform = plat;
            this.isJumping = false;
            if (plat.type === 'ice') this.onIce = true;
          }
        } else if (this.position.y < pp.y) {
          // Hit from below
          this.position.y = pMinY - PR;
          if (this.velocity.y > 0) this.velocity.y = 0;
        }
      } else if (ovX <= ovZ) {
        // X wall
        if (this.position.x > pp.x) this.position.x = pMaxX + PR;
        else this.position.x = pMinX - PR;
        this.velocity.x = 0;
      } else {
        // Z wall
        if (this.position.z > pp.z) this.position.z = pMaxZ + PR;
        else this.position.z = pMinZ - PR;
        this.velocity.z = 0;
      }
    }

    // --- Platform events ---
    // Left a platform → start dissolve
    if (this.prevStandingPlatform && this.prevStandingPlatform !== this.standingPlatform) {
      this.prevStandingPlatform.onPlayerLeave();
    }
    // Stepped on platform → notify it
    if (this.standingPlatform && this.standingPlatform !== this.prevStandingPlatform) {
      this.standingPlatform.onPlayerEnter();
    }

    // --- Jump ---
    const canJump = this.coyoteTimer > 0;
    if (canJump && this.jumpBuffer > 0) {
      this.velocity.y = JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.isJumping = true;
      this.jumpHoldTime = 0;
    }

    // Variable height: hold to go higher
    if (this.isJumping && input.jumpHeld && this.velocity.y > 0) {
      this.jumpHoldTime += dt;
      if (this.jumpHoldTime < 0.25) {
        this.velocity.y = Math.min(this.velocity.y + 18 * dt, JUMP_VELOCITY_MAX);
      }
    }
    // Cut jump early
    if (!input.jumpHeld && this.isJumping && this.velocity.y > JUMP_VELOCITY * 0.5) {
      this.velocity.y = JUMP_VELOCITY * 0.5;
      this.isJumping = false;
    }

    // --- Death check ---
    if (this.position.y < VOID_THRESHOLD) return 'death';
    return null;
  }
}
