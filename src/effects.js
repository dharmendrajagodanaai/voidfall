import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const VignetteShader = {
  name: 'VignetteShader',
  uniforms: {
    tDiffuse: { value: null },
    offset:   { value: 0.9 },
    darkness: { value: 1.4 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main(){
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vignette = smoothstep(offset, offset - 0.5, length(uv));
      gl_FragColor = vec4(mix(texel.rgb * (1.0 - darkness * 0.5), texel.rgb, vignette), texel.a);
    }
  `,
};

export class Effects {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,   // strength  (was 0.55 — still causing sun-like glare, reduced further)
      0.25,  // radius    (was 0.35 — tighter bloom spread)
      0.85   // threshold (was 0.75 — raised so only truly bright elements bloom)
    );
    this.composer.addPass(bloomPass);
    this.bloomPass = bloomPass;

    const vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(vignettePass);

    window.addEventListener('resize', () => {
      this.composer.setSize(window.innerWidth, window.innerHeight);
      bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    });
  }

  render() {
    this.composer.render();
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }
}
