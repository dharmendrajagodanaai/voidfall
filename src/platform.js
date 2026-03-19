import * as THREE from 'three';

// --- Dissolve shader (with inlined simplex noise) ---
const DISSOLVE_VERT = `
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SIMPLEX_NOISE = `
vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289v3(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const DISSOLVE_FRAG = `
${SIMPLEX_NOISE}
uniform float dissolveProgress;
uniform vec3 edgeColor;
uniform float edgeWidth;
uniform float noiseScale;
uniform vec3 platformColor;
uniform float time;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main(){
  float n=(snoise(vWorldPos*noiseScale+time*.5)+1.)*.5;
  if(n<dissolveProgress) discard;
  float edge=smoothstep(dissolveProgress,dissolveProgress+edgeWidth,n);
  vec3 col=mix(edgeColor*1.5,platformColor,edge); // was edgeColor*3. — reduced to prevent edge glow from over-driving bloom
  float light=dot(vNormal,normalize(vec3(1.,2.,1.)))*.5+.5;
  col*=light;
  gl_FragColor=vec4(col,1.);
}`;

// Platform type configs
export const PLATFORM_TYPES = {
  solid:      { color: new THREE.Color(0.15, 0.75, 0.3),  dissolveTime: 3.0, friction: 1 },
  ice:        { color: new THREE.Color(0.3,  0.55, 1.0),  dissolveTime: 2.0, friction: 0.15 },
  crumble:    { color: new THREE.Color(0.9,  0.25, 0.1),  dissolveTime: 1.5, friction: 1 },
  bounce:     { color: new THREE.Color(1.0,  0.8,  0.0),  dissolveTime: 3.0, friction: 1 },
  moving:     { color: new THREE.Color(0.65, 0.2,  1.0),  dissolveTime: 4.0, friction: 1 },
  checkpoint: { color: new THREE.Color(0.3,  0.5,  0.85), dissolveTime: 999, friction: 1 }, // was (0.9, 0.95, 1.0) — near-white caused sun-like bloom glare on first platform
};

let _matCache = {};
function getMaterial(type) {
  if (_matCache[type]) return _matCache[type];
  const cfg = PLATFORM_TYPES[type];
  const mat = new THREE.ShaderMaterial({
    vertexShader: DISSOLVE_VERT,
    fragmentShader: DISSOLVE_FRAG,
    uniforms: {
      dissolveProgress: { value: 0 },
      edgeColor:        { value: new THREE.Color(1.0, 0.4, 0.1) },
      edgeWidth:        { value: 0.06 },
      noiseScale:       { value: 3.0 },
      platformColor:    { value: cfg.color.clone() },
      time:             { value: 0 },
    },
    side: THREE.FrontSide,
  });
  _matCache[type] = mat;
  return mat;
}

export class Platform {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.type = 'solid';
    this.position = { x: 0, y: 0, z: 0 };
    this.halfSize = { x: 2, y: 0.25, z: 2 };
    this.dissolveProgress = 0;
    this.dissolveTimer = 0;
    this.dissolving = false;
    this.fallen = false;
    this.platformIndex = 0;

    // Moving platform state
    this.moveAxis = 'x';
    this.moveAmplitude = 3;
    this.moveFrequency = 0.8;
    this.movePhase = 0;
    this.moveOrigin = { x: 0, y: 0, z: 0 };
    this._prevMovePos = { x: 0, z: 0 };

    // Mesh
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.Mesh(geo, getMaterial('solid').clone());
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  activate(pos, size, type, index) {
    this.active = true;
    this.type = type;
    this.platformIndex = index;
    this.position.x = pos.x;
    this.position.y = pos.y;
    this.position.z = pos.z;
    this.halfSize.x = size.x / 2;
    this.halfSize.y = size.y / 2;
    this.halfSize.z = size.z / 2;
    this.dissolveProgress = 0;
    this.dissolveTimer = 0;
    this.dissolving = false;
    this.fallen = false;
    this.moveOrigin.x = pos.x;
    this.moveOrigin.y = pos.y;
    this.moveOrigin.z = pos.z;
    this._prevMovePos.x = pos.x;
    this._prevMovePos.z = pos.z;

    // Update mesh geometry scale
    this.mesh.scale.set(size.x, size.y, size.z);
    this.mesh.position.set(pos.x, pos.y, pos.z);
    this.mesh.visible = true;

    // Swap material for this type
    const cfg = PLATFORM_TYPES[type];
    if (!this.mesh.material.uniforms) {
      this.mesh.material = getMaterial(type).clone();
    } else {
      this.mesh.material.uniforms.platformColor.value.copy(cfg.color);
      this.mesh.material.uniforms.dissolveProgress.value = 0;
    }
    // Use a fresh clone so each platform has independent uniforms
    this.mesh.material = new THREE.ShaderMaterial({
      vertexShader: DISSOLVE_VERT,
      fragmentShader: DISSOLVE_FRAG,
      uniforms: {
        dissolveProgress: { value: 0 },
        edgeColor:        { value: new THREE.Color(1.0, 0.4, 0.1) },
        edgeWidth:        { value: 0.06 },
        noiseScale:       { value: 3.0 },
        platformColor:    { value: cfg.color.clone() },
        time:             { value: 0 },
      },
      side: THREE.FrontSide,
    });
  }

  deactivate() {
    this.active = false;
    this.mesh.visible = false;
  }

  onPlayerEnter() {
    if (this.type === 'crumble' && !this.dissolving) {
      this.startDissolve();
    }
  }

  onPlayerLeave() {
    if (this.type !== 'checkpoint' && !this.dissolving) {
      this.startDissolve();
    }
  }

  startDissolve() {
    if (this.dissolving || this.type === 'checkpoint') return;
    this.dissolving = true;
    this.dissolveTimer = PLATFORM_TYPES[this.type].dissolveTime;
  }

  getVelocity() {
    return { x: 0, y: 0, z: 0 }; // overridden below for moving
  }

  update(dt, totalTime) {
    if (!this.active) return;

    // Moving platform oscillation
    if (this.type === 'moving') {
      const prevX = this.position.x;
      const prevZ = this.position.z;
      const offset = Math.sin(totalTime * this.moveFrequency + this.movePhase) * this.moveAmplitude;
      if (this.moveAxis === 'x') {
        this.position.x = this.moveOrigin.x + offset;
      } else {
        this.position.z = this.moveOrigin.z + offset;
      }
      this._velX = (this.position.x - prevX) / dt;
      this._velZ = (this.position.z - prevZ) / dt;
      this.mesh.position.x = this.position.x;
      this.mesh.position.z = this.position.z;
    }

    // Dissolve
    if (this.dissolving) {
      const cfg = PLATFORM_TYPES[this.type];
      this.dissolveTimer -= dt;
      const progress = 1 - Math.max(0, this.dissolveTimer / cfg.dissolveTime);
      this.dissolveProgress = Math.min(progress, 1);
      this.mesh.material.uniforms.dissolveProgress.value = this.dissolveProgress;
      this.mesh.material.uniforms.time.value = totalTime;

      if (this.dissolveProgress >= 0.99 && !this.fallen) {
        this.fallen = true;
        // Fall into void
        this._fallVel = 0;
      }
      if (this.fallen) {
        this._fallVel = (this._fallVel || 0) - 18 * dt;
        this.mesh.position.y += this._fallVel * dt;
        if (this.mesh.position.y < -60) {
          this.deactivate();
        }
      }
    } else {
      this.mesh.material.uniforms.time.value = totalTime;
    }
  }
}

// Override getVelocity for moving platforms
Platform.prototype.getVelocity = function() {
  if (this.type === 'moving') return { x: this._velX || 0, y: 0, z: this._velZ || 0 };
  return { x: 0, y: 0, z: 0 };
};

// Platform pool — reuse Platform objects
export class PlatformPool {
  constructor(scene, size = 60) {
    this.pool = [];
    for (let i = 0; i < size; i++) {
      this.pool.push(new Platform(scene));
    }
    this.active = [];
  }

  get(pos, size, type, index) {
    // Find inactive platform in pool
    let plat = this.pool.find(p => !p.active);
    if (!plat) {
      // Steal the oldest active one that's been dissolved
      plat = this.active.find(p => p.fallen) || this.pool[0];
      plat.deactivate();
      this.active = this.active.filter(p => p !== plat);
    }
    plat.activate(pos, size, type, index);
    this.active.push(plat);
    return plat;
  }

  release(plat) {
    plat.deactivate();
    this.active = this.active.filter(p => p !== plat);
  }

  update(dt, totalTime) {
    for (const p of this.active) p.update(dt, totalTime);
    // Remove fully deactivated platforms from active list
    this.active = this.active.filter(p => p.active);
  }

  getActivePlatforms() {
    return this.active;
  }
}
