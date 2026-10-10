import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

class NkViewer extends HTMLElement {
  static get observedAttributes() { return ['src', 'pinning', 'bg', 'poster', 'pins', 'active-pin', 'activepin']; }
  constructor() {
    super();
    this._pins = [];
    this._active = null;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{display:block;position:relative;overflow:hidden;border-radius:inherit;background:#1B1D21}
      canvas{display:block;width:100%;height:100%;touch-action:none}
      .pins{position:absolute;inset:0;pointer-events:none}
      .pin{position:absolute;width:24px;height:24px;margin:-24px 0 0 -12px;border-radius:12px 12px 12px 2px;background:#E9A23B;color:#17181B;font:600 11px Geist,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform 150ms,opacity 150ms;transform-origin:50% 100%}
      .pin.active{transform:scale(1.2)}
      .pin.hidden{opacity:.25}
      .hint{position:absolute;left:16px;bottom:16px;font:400 12px 'Geist Mono',ui-monospace,monospace;color:#EEF0F2;background:rgba(14,15,17,.6);padding:4px 8px;border-radius:4px;pointer-events:none;white-space:nowrap}
      .poster{position:absolute;inset:0;background-size:cover;background-position:center;pointer-events:none;transition:opacity 300ms}
      .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:400 13px Geist,system-ui,sans-serif;color:#EEF0F2;pointer-events:none;transition:opacity 300ms;text-shadow:0 1px 4px rgba(0,0,0,.6)}
      
    </style><canvas></canvas><div class="poster"></div><div class="pins"></div><div class="loading">Loading model</div><div class="hint">Drag to orbit · Scroll to zoom · Right drag to pan</div>`;
    this._canvas = root.querySelector('canvas');
    this._pinLayer = root.querySelector('.pins');
    this._loading = root.querySelector('.loading');
    this._poster = root.querySelector('.poster');
    this._hint = root.querySelector('.hint');
  }
  connectedCallback() {
    const r = this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    this._scene = new THREE.Scene();
    this._scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture;
    this._camera = new THREE.PerspectiveCamera(40, 1, .01, 100);
    this._controls = new OrbitControls(this._camera, this._canvas);
    this._controls.enableDamping = true; this._controls.dampingFactor = .08;
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 4); this._scene.add(key);
    this._scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, .5));
    this._ray = new THREE.Raycaster();
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
    this._canvas.addEventListener('pointerdown', (e) => { this._down = [e.clientX, e.clientY]; });
    this._canvas.addEventListener('pointerup', (e) => { if (!this._down) return; const moved = Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]); this._down = null; if (moved < 4 && this._pinOn) this._dropPin(e); });
    this._resize(); this._load(); this._tick();
  }
  disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro.disconnect(); this._renderer.dispose(); }
  attributeChangedCallback(n, _o, v) { if (n === 'src' && this._scene) this._load(); if (n === 'bg') this.style.background = v || ''; if (n === 'pins') { try { this._pins = JSON.parse(v || '[]'); } catch (e) { this._pins = []; } this._renderPins(); }
    if (n === 'active-pin' || n === 'activepin') { this._active = v || null; this._renderPins(); }
    if (n === 'pinning' && this._hint) { const on = v != null && v !== '' && v !== 'false'; this._pinOn = on; this._hint.textContent = on ? 'Click the model to pin a comment' : 'Drag to orbit · Scroll to zoom · Right drag to pan'; this._canvas.style.cursor = on ? 'crosshair' : ''; }
    if (n === 'poster' && this._poster) this._poster.style.backgroundImage = v ? 'url(' + v + ')' : 'none'; }
  set pins(list) { this._pins = list || []; this._renderPins(); }
  get pins() { return this._pins; }
  set activePin(id) { this._active = id; this._renderPins(); }
  _resize() { const w = this.clientWidth || 1, h = this.clientHeight || 1; this._renderer.setSize(w, h, false); this._camera.aspect = w / h; this._camera.updateProjectionMatrix(); }
  _load() {
    const src = this.getAttribute('src'); if (!src) return;
    if (this._model) { this._scene.remove(this._model); this._model = null; }
    this._loading.style.opacity = 1; this._loading.textContent = 'Loading model'; this._poster.style.opacity = 1;
    new GLTFLoader().load(src, (g) => {
      const m = g.scene; this._model = m; this._scene.add(m);
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      m.position.sub(center);
      const d = Math.max(size.x, size.y, size.z);
      this._camera.position.set(d * 1.1, d * .6, d * 1.5); this._camera.near = d / 100; this._camera.far = d * 20; this._camera.updateProjectionMatrix();
      this._controls.target.set(0, 0, 0); this._controls.minDistance = d * .4; this._controls.maxDistance = d * 5; this._controls.update();
      this._loading.style.opacity = 0; this._poster.style.opacity = 0;
      this.dispatchEvent(new CustomEvent('nk-loaded', { bubbles: true }));
    }, (p) => { if (p.total) this._loading.textContent = 'Loading model · ' + Math.round(p.loaded / p.total * 100) + '%'; }, () => { this._loading.textContent = 'Model did not load. Showing the last render.'; });
  }
  _dropPin(e) {
    if (!this._model) return;
    const rect = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this._camera);
    const hit = this._ray.intersectObject(this._model, true)[0];
    if (!hit) return;
    this.dispatchEvent(new CustomEvent('nk-pin', { bubbles: true, detail: { pos: [hit.point.x, hit.point.y, hit.point.z] } }));
  }
  _renderPins() {
    const layer = this._pinLayer; layer.innerHTML = '';
    this._pinEls = this._pins.map((p, i) => { const el = document.createElement('div'); el.className = 'pin' + (p.id === this._active ? ' active' : ''); el.textContent = i + 1; el.onclick = (ev) => { ev.stopPropagation(); this.dispatchEvent(new CustomEvent('nk-pin-select', { bubbles: true, detail: { id: p.id } })); }; layer.appendChild(el); return el; });
  }
  _tick() {
    this._raf = requestAnimationFrame(() => this._tick());
    this._controls.update(); this._renderer.render(this._scene, this._camera);
    if (!this._pinEls || !this._pinEls.length) return;
    const w = this.clientWidth, h = this.clientHeight, camPos = this._camera.position;
    this._pins.forEach((p, i) => {
      const v = new THREE.Vector3(...p.pos), el = this._pinEls[i]; if (!el) return;
      let occluded = false;
      if (this._model) { const dir = v.clone().sub(camPos); const dist = dir.length(); this._ray.set(camPos, dir.normalize()); const hit = this._ray.intersectObject(this._model, true)[0]; occluded = !!hit && hit.distance < dist - 0.02; }
      v.project(this._camera);
      el.style.left = ((v.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - v.y) / 2 * h) + 'px';
      el.classList.toggle('hidden', occluded);
    });
  }
}
customElements.define('nk-viewer', NkViewer);
