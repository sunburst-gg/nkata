// Ported from handoff/v8/nk-viewer.js. Changes are marked NKATA and logged in docs/decisions.md.
// Step 1: (a) three resolves from the npm package, (b) the host background is transparent,
// (c) the loading and error text read their color and font from the host's custom properties.
// Step 4: (d) still capture: after the model loads and the first frame renders, the canvas is
// captured once into a module Map keyed by src and size, and _release sets that still as the
// poster before the context is freed, so a card past the pool cap never goes blank; (e) the pool
// is exposed as window.__nkataPool for the dev Tweaks' "live contexts n / 8"; (f) a released
// viewer boots again on a fresh canvas, because a canvas whose context was force-lost cannot
// hand out a new one and three.js then fails on getContext; (g) data-live marks a viewer that
// holds a context, so a card can show the ghost placeholder while it has neither context nor still.
// NKATA (a): the npm package, not an import map.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

class NkViewer extends HTMLElement {
  static get observedAttributes() { return ['src', 'pinning', 'bg', 'ghost', 'autorotate', 'hover-rotate', 'hoverrotate', 'poster', 'pins', 'active-pin', 'activepin']; }
  constructor() {
    super();
    this._pins = [];
    this._active = null;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;border-radius:inherit;background:transparent} /* NKATA (b): was #1B1D21, which flashed dark behind models in light theme */
      canvas{display:block;width:100%;height:100%;touch-action:none}
      .pins{position:absolute;inset:0;pointer-events:none}
      .pin{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--pin,#E9A23B);box-shadow:0 0 0 2.5px #fff,0 2px 6px rgba(0,0,0,.35);color:transparent;font:0/0 a;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform 150ms,opacity 150ms;transform-origin:50% 100%}
      .pin.active{transform:scale(1.2)}
      .pin.hidden{opacity:.25}
      .hint{position:absolute;left:16px;bottom:16px;font:400 12px 'Geist Mono',ui-monospace,monospace;color:#EEF0F2;background:rgba(14,15,17,.6);padding:4px 8px;border-radius:4px;pointer-events:none;white-space:nowrap}
      .poster{position:absolute;inset:0;background-size:cover;background-position:center;pointer-events:none;transition:opacity 300ms}
      .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:var(--nk-loading-font,400 13px Geist,system-ui,sans-serif);color:var(--nk-loading-color,#EEF0F2);pointer-events:none;transition:opacity 300ms;text-shadow:var(--nk-loading-shadow,none)} /* NKATA (c): the host sets --nk-loading-color, --nk-loading-font and --nk-loading-shadow */
      
    </style><canvas></canvas><div class="poster"></div><div class="pins"></div><div class="loading">Loading model</div><div class="hint">Drag to orbit · Scroll to zoom · Right drag to pan</div>`;
    this._canvas = root.querySelector('canvas');
    this._pinLayer = root.querySelector('.pins');
    this._loading = root.querySelector('.loading');
    this._poster = root.querySelector('.poster');
    this._hint = root.querySelector('.hint');
  }
  connectedCallback() {
    if ((this.hasAttribute('hover-rotate') || this.hasAttribute('hoverrotate')) && 'IntersectionObserver' in window) { this._card = true; this._io = new IntersectionObserver((es) => { es.forEach(e => { if (e.isIntersecting) this._acquire(); else this._release(); }); }, { rootMargin: '80px' }); this._io.observe(this); return; }
    this._boot();
  }
  _acquire() { if (this._renderer) return; const P = NkViewer._pool; while (P.length >= 8) { const old = P.shift(); if (old) old._release(true); } P.push(this); this._boot(); }
  // NKATA (d): the still of this src at this size, captured once, shown as the poster while the
  // context is released. Keyed by src and size so a resized card captures again.
  _stillKey() { return (this.getAttribute('src') || '') + '@' + this.clientWidth + 'x' + this.clientHeight + '@' + Math.min(2, window.devicePixelRatio); }
  _captureStill() { try { const key = this._stillKey(); if (NkViewer._stills.has(key)) return; const url = this._canvas.toDataURL('image/webp', 0.9); NkViewer._stills.set(key, url); } catch (e) { /* a tainted or lost canvas yields no still; the ghost stays */ } }
  get still() { return NkViewer._stills.get(this._stillKey()) || null; }
  _release(force) { const P = NkViewer._pool; const k = P.indexOf(this); if (k >= 0) P.splice(k, 1); if (!this._renderer) return; cancelAnimationFrame(this._raf);
    if (this._model) { const still = this.still; if (still) { this._poster.style.backgroundImage = 'url(' + still + ')'; this._poster.style.opacity = 1; this.setAttribute('data-still', 'true'); } } /* NKATA (d) */ if (this._ro) this._ro.disconnect(); if (this._model) { this._scene.remove(this._model); this._model = null; } this._renderer.dispose(); if (this._renderer.forceContextLoss) this._renderer.forceContextLoss(); this._renderer = null; this._spent = true; this.removeAttribute('data-live'); this._loadingSrc = null; this._loading.style.opacity = 0; } // NKATA (f, g)
  _boot() {
    if (this._spent) { const fresh = document.createElement('canvas'); this._canvas.replaceWith(fresh); this._canvas = fresh; this._spent = false; } // NKATA (f)
    this.setAttribute('data-live', 'true'); // NKATA (g)
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
    this._resize(); this._tick(); this._load(); if (this._card) { this._hint.style.display = 'none'; const host = this.parentElement && this.parentElement.parentElement ? this.parentElement.parentElement : this; if (!this._hovBound) { this._hovBound = true; host.addEventListener('mouseenter', () => { if (this._controls) { this._controls.autoRotate = true; this._controls.autoRotateSpeed = 1.2; } }); host.addEventListener('mouseleave', () => { if (this._controls) this._controls.autoRotate = false; }); } } if (false) { const host = this.parentElement && this.parentElement.parentElement ? this.parentElement.parentElement : this; host.addEventListener('mouseenter', () => { this._controls.autoRotate = true; this._controls.autoRotateSpeed = 1.2; }); host.addEventListener('mouseleave', () => { this._controls.autoRotate = false; }); if (this._hint) this._hint.style.display = 'none'; }
  }
  disconnectedCallback() { if (this._io) { this._io.disconnect(); this._release(); return; } cancelAnimationFrame(this._raf); if (this._ro) this._ro.disconnect(); if (this._renderer) { this._renderer.dispose(); this._renderer.forceContextLoss && this._renderer.forceContextLoss(); this._renderer = null; this._spent = true; this.removeAttribute('data-live'); } } // NKATA (f, g)
  attributeChangedCallback(n, _o, v) { if (n === 'src' && this._scene) this._load(); if (n === 'bg') this.style.background = v || ''; if (n === 'pins') { try { this._pins = JSON.parse(v || '[]'); } catch (e) { this._pins = []; } this._renderPins(); }
    if (n === 'active-pin' || n === 'activepin') { this._active = v || null; this._renderPins(); }
    if (n === 'pinning' && this._hint) { const on = v != null && v !== '' && v !== 'false'; this._pinOn = on; this._hint.style.display = on ? 'none' : ''; this._hint.textContent = on ? '' : 'Drag to orbit · Scroll to zoom · Right drag to pan'; this._canvas.style.cursor = on ? 'crosshair' : ''; }
    if (n === 'ghost' && this._model) this._applyGhost();
    if (n === 'autorotate' && this._hint) this._hint.style.display = 'none';
    if (n === 'autorotate' && this._controls) { this._controls.autoRotate = v != null && v !== 'false'; this._controls.autoRotateSpeed = parseFloat(v) || 0.6; }
    if (n === 'poster' && this._poster) this._poster.style.backgroundImage = v ? 'url(' + v + ')' : 'none'; }
  set pins(list) { this._pins = list || []; this._renderPins(); }
  get pins() { return this._pins; }
  set activePin(id) { this._active = id; this._renderPins(); }
  _applyGhost() { if (!this._model) return; const on = this.hasAttribute('ghost') && this.getAttribute('ghost') !== 'false'; this._model.traverse(o => { if (!o.isMesh) return; if (on) { if (!o.userData.nkMat) o.userData.nkMat = o.material; o.material = new THREE.MeshBasicMaterial({ color: 0xE9A23B, wireframe: true, transparent: true, opacity: 0.3 }); } else if (o.userData.nkMat) { o.material = o.userData.nkMat; o.userData.nkMat = null; } }); if (on) { this._loading.style.opacity = 0; this._poster.style.opacity = 0; } }
  _resize() { const w = this.clientWidth || 1, h = this.clientHeight || 1; this._renderer.setSize(w, h, false); this._camera.aspect = w / h; this._camera.updateProjectionMatrix(); }
  _load() {
    const src = this.getAttribute('src'); if (!src) return;
    if (src === this._loadingSrc) return;
    this._loadingSrc = src; const token = this._token = (this._token || 0) + 1;
    if (this._model) { this._scene.remove(this._model); this._model = null; }
    this._loading.style.opacity = 1; this._loading.textContent = 'Loading model'; this._poster.style.opacity = 1;
    const finish = () => { if (token !== this._token) return; this._done = token; this._loading.style.opacity = 0; this._poster.style.opacity = 0; this.removeAttribute('data-still'); };
    new GLTFLoader().load(src, (g) => {
      if (token !== this._token) return;
      try {
      const m = g.scene; this._model = m; this._scene.add(m); this._applyGhost(); if (this.hasAttribute('autorotate')) { this._controls.autoRotate = true; this._controls.autoRotateSpeed = parseFloat(this.getAttribute('autorotate')) || 0.6; }
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      m.position.sub(center);
      const d = Math.max(size.x, size.y, size.z);
      this._camera.position.set(d * 1.1, d * .6, d * 1.5); this._camera.near = d / 100; this._camera.far = d * 20; this._camera.updateProjectionMatrix();
      this._controls.target.set(0, 0, 0); this._controls.minDistance = d * .4; this._controls.maxDistance = d * 5; this._controls.update();
      } finally { finish(); }
      this._captureAfter = 2; // NKATA (d): capture a still two frames after the load
      this.dispatchEvent(new CustomEvent('nk-loaded', { bubbles: true }));
    }, (p) => { if (token !== this._token || this._done === token) return; if (p.total) this._loading.textContent = 'Loading model · ' + Math.round(p.loaded / p.total * 100) + '%'; }, () => { if (token !== this._token) return; this._loadingSrc = null; this._loading.textContent = 'Model did not load. Showing the last render.'; });
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
    this._pinEls = this._pins.map((p, i) => { const el = document.createElement('div'); el.className = 'pin' + (p.id === this._active ? ' active' : ''); el.textContent = i + 1; if (p.color) el.style.setProperty('--pin', p.color); el.onclick = (ev) => { ev.stopPropagation(); this.dispatchEvent(new CustomEvent('nk-pin-select', { bubbles: true, detail: { id: p.id } })); }; layer.appendChild(el); return el; });
  }
  _tick() {
    if (!this._renderer) return;
    this._raf = requestAnimationFrame(() => this._tick());
    this._controls.update(); this._renderer.render(this._scene, this._camera);
    if (this._captureAfter != null && this._model && !(this.hasAttribute('ghost') && this.getAttribute('ghost') !== 'false')) { if (this._captureAfter-- <= 0) { this._captureAfter = null; this._captureStill(); } } // NKATA (d)
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
NkViewer._pool = [];
NkViewer._stills = new Map(); // NKATA (d)
if (typeof window !== 'undefined') window.__nkataPool = NkViewer._pool; // NKATA (e)
customElements.define('nk-viewer', NkViewer);
