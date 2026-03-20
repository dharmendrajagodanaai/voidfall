import * as THREE from 'three';
import { PlayerPhysics } from './physics.js';
import { Player } from './player.js';
import { World, getDailySeed } from './world.js';
import { GameCamera } from './camera.js';
import { Effects } from './effects.js';
import { GhostSystem } from './ghost.js';
import { AudioManager } from './audio.js';
import { Leaderboard } from './leaderboard.js';
import { UI } from './ui.js';

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8; // was 0.9 — further reduced to prevent bloom glare on platforms
document.getElementById('canvas-container').appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050815, 0.012);
scene.background = new THREE.Color(0x030610);

// Ambient + directional light
const ambient = new THREE.AmbientLight(0x223366, 1.5);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.4); // was 2 — reduced to tone down overall scene brightness
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ─── Subsystems ───────────────────────────────────────────────────────────────
const audio = new AudioManager();
const leaderboard = new Leaderboard();
const ui = new UI();

const world = new World(scene);
const physics = new PlayerPhysics();
const player = new Player(scene);
const gameCam = new GameCamera(renderer);
const effects = new Effects(renderer, scene, gameCam.camera);
const ghost = new GhostSystem(scene);

// ─── Game State ───────────────────────────────────────────────────────────────
const STATE = { PLAYING: 'PLAYING', DEAD: 'DEAD', WIN: 'WIN' };
let gameState = STATE.PLAYING;
let seed = getDailySeed();
let startTime = 0;
let totalTime = 0;
let platformsReached = 0;
let lastCheckpointPlat = 0;
let lastGrounded = false;
let lastDashCooldown = 0;

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  world.init(seed);
  const sp = world.getStartPos();
  physics.reset(sp.x, sp.y, sp.z);
  player.setVisible(true);
  ghost.clear();
  ghost.startRecording();

  // Load ghosts from leaderboard
  const ghostData = leaderboard.getGhosts(seed);
  if (ghostData.length > 0) ghost.playGhosts(ghostData);

  gameState = STATE.PLAYING;
  startTime = performance.now();
  platformsReached = 0;
  lastCheckpointPlat = 0;

  ui.hideDeath();
  ui.hideWin();

  // Warm up world (spawn initial platforms)
  world.update(sp, 0);
}

// ─── Restart ──────────────────────────────────────────────────────────────────
function restart() {
  seed = getDailySeed();
  totalTime = 0;
  lastGrounded = false;
  lastDashCooldown = 0;
  world.reset(seed);
  init();
}
window.gameRestart = restart;

// R key restart
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restart();
});

// ─── Game Loop ────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function loop() {
  requestAnimationFrame(loop);

  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05);
  totalTime += dt;

  if (gameState === STATE.PLAYING) {
    updateGame(dt);
  } else {
    ghost.update(dt);
    world.update(physics.position, dt);
  }

  gameCam.update(dt, physics.position);
  effects.render();
}

function updateGame(dt) {
  player.collectInput();
  const input = player.input;

  // Dash audio
  if (input.dash && lastDashCooldown <= 0) {
    audio.playDash();
  }
  lastDashCooldown = physics.dashCooldown;

  // Physics
  const result = physics.update(dt, input, world.getActivePlatforms(), gameCam.getYaw());

  // Land / jump audio
  if (!lastGrounded && physics.grounded) audio.playLand();
  if (lastGrounded && !physics.grounded && physics.velocity.y > 3) audio.playJump();
  lastGrounded = physics.grounded;

  // World update
  world.update(physics.position, dt);

  // Collectibles
  world.checkCollectibles(physics.position);

  // Player visual update
  player.update(physics.position, physics.velocity, dt, totalTime);

  // Platform progress tracking
  const curPlatIdx = world.getCurrentPlatformIndex(physics.position);
  if (curPlatIdx > platformsReached) {
    platformsReached = curPlatIdx;
    if (world.checkpoints.has(curPlatIdx) && curPlatIdx > lastCheckpointPlat) {
      lastCheckpointPlat = curPlatIdx;
      ui.flashCheckpoint();
      audio.playCheckpoint();
    }
  }

  // Ghost
  ghost.record(physics.position, physics.velocity, dt);

  // HUD
  const speed = Math.sqrt(
    physics.velocity.x * physics.velocity.x +
    physics.velocity.z * physics.velocity.z
  );
  ui.update(platformsReached, speed, physics.dashCooldown);

  // Win: reached beacon
  if (world.beaconPos) {
    const bp = world.beaconPos;
    const dx = bp.x - physics.position.x;
    const dy = bp.y - physics.position.y;
    const dz = bp.z - physics.position.z;
    if (dx*dx + dy*dy + dz*dz < 12) {
      triggerWin();
      return;
    }
  }

  if (result === 'death') triggerDeath();
}

function triggerDeath() {
  gameState = STATE.DEAD;
  audio.playDeath();
  const frames = ghost.stopRecording();
  const elapsed = performance.now() - startTime;
  leaderboard.submit(seed, platformsReached, elapsed, frames);
  const pb = leaderboard.getPersonalBest(seed);
  const scores = leaderboard.getTopScores(seed);
  ui.showDeath(platformsReached, pb, scores);
  const ghostData = leaderboard.getGhosts(seed);
  if (ghostData.length > 0) ghost.playGhosts(ghostData);
}

function triggerWin() {
  gameState = STATE.WIN;
  audio.playWin();
  const frames = ghost.stopRecording();
  const elapsed = performance.now() - startTime;
  leaderboard.submit(seed, world.getPlatformCount(), elapsed, frames);
  ui.showWin(world.getPlatformCount(), elapsed);
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
loop();
