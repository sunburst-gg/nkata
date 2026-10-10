// The nk-viewer web component from handoff/v3/nk-viewer.js, ported as is to TypeScript.
// Orbit, zoom, pan, a poster while the GLB loads, progress, and comment pins that project to
// the screen each frame and fade when the mesh hides them. Events: nk-loaded, nk-pin (a click in
// pinning mode, detail.pos), nk-pin-select (detail.id). three.js, bundled by Vite; no network.
// https://threejs.org/docs/
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export interface ViewerPin {
  id: string;
  pos: [number, number, number];
}

const STYLE = `
  :host{display:block;position:relative;overflow:hidden;border-radius:inherit;background:var(--preview-bg)}
  canvas{display:block;width:100%;height:100%;touch-action:none}
  .pins{position:absolute;inset:0;pointer-events:none}
  .pin{position:absolute;width:24px;height:24px;margin:-24px 0 0 -12px;border-radius:12px 12px 12px 2px;background:var(--accent);color:var(--accent-fg);font:600 11px Geist,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform 150ms,opacity 150ms;transform-origin:50% 100%}
  .pin.active{transform:scale(1.2)}
  .pin.hidden{opacity:.25}
  .hint{position:absolute;left:16px;bottom:16px;font:400 12px 'Geist Mono',ui-monospace,monospace;color:var(--on-scrim);background:var(--scrim);padding:4px 8px;border-radius:4px;pointer-events:none;white-space:nowrap}
  .poster{position:absolute;inset:0;background-size:cover;background-position:center;pointer-events:none;transition:opacity 300ms}
  .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:400 13px Geist,system-ui,sans-serif;color:var(--on-scrim);pointer-events:none;transition:opacity 300ms;text-shadow:0 1px 4px rgba(0,0,0,.6)}
`;

const ORBIT_HINT = "Drag to orbit · Scroll to zoom · Right drag to pan";
const PIN_HINT = "Click the model to pin a comment";

export class NkViewer extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "pinning", "bg", "poster", "pins", "active-pin", "activepin"];
  }

  private _pins: ViewerPin[] = [];
  private _active: string | null = null;
  private _pinOn = false;
  private _down: [number, number] | null = null;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _pinLayer: HTMLDivElement;
  private readonly _loading: HTMLDivElement;
  private readonly _poster: HTMLDivElement;
  private readonly _hint: HTMLDivElement;
  private _pinEls: HTMLDivElement[] = [];
  private _renderer: THREE.WebGLRenderer | null = null;
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.PerspectiveCamera | null = null;
  private _controls: OrbitControls | null = null;
  private _ray = new THREE.Raycaster();
  private _ro: ResizeObserver | null = null;
  private _raf = 0;
  private _model: THREE.Object3D | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style><canvas></canvas><div class="poster"></div><div class="pins"></div><div class="loading">Loading model</div><div class="hint">${ORBIT_HINT}</div>`;
    this._canvas = root.querySelector("canvas") as HTMLCanvasElement;
    this._pinLayer = root.querySelector(".pins") as HTMLDivElement;
    this._loading = root.querySelector(".loading") as HTMLDivElement;
    this._poster = root.querySelector(".poster") as HTMLDivElement;
    this._hint = root.querySelector(".hint") as HTMLDivElement;
  }

  connectedCallback(): void {
    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true });
    } catch {
      // No WebGL (a headless check, an old GPU): the poster stays and nothing else runs.
      this._loading.textContent = "The model needs WebGL. Showing the last render.";
      return;
    }
    this._renderer = r;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    const scene = (this._scene = new THREE.Scene());
    scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = (this._camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100));
    const controls = (this._controls = new OrbitControls(camera, this._canvas));
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    this._canvas.addEventListener("pointerdown", (e) => { this._down = [e.clientX, e.clientY]; });
    this._canvas.addEventListener("pointerup", (e) => {
      if (!this._down) return;
      const moved = Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]);
      this._down = null;
      if (moved < 4 && this._pinOn) this._dropPin(e);
    });
    this._resize();
    this._load();
    this._tick();
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this._renderer?.dispose();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "src" && this._scene) this._load();
    if (name === "bg") this.style.background = value ?? "";
    if (name === "pins") {
      try {
        this._pins = JSON.parse(value || "[]") as ViewerPin[];
      } catch {
        this._pins = [];
      }
      this._renderPins();
    }
    if (name === "active-pin" || name === "activepin") {
      this._active = value || null;
      this._renderPins();
    }
    if (name === "pinning") {
      const on = value != null && value !== "" && value !== "false";
      this._pinOn = on;
      this._hint.textContent = on ? PIN_HINT : ORBIT_HINT;
      this._canvas.style.cursor = on ? "crosshair" : "";
    }
    if (name === "poster") this._poster.style.backgroundImage = value ? `url(${value})` : "none";
  }

  // React 19 sets a prop as a property when the element has one, so the JSON string lands here.
  set pins(list: ViewerPin[] | string) {
    if (typeof list === "string") {
      try {
        this._pins = JSON.parse(list || "[]") as ViewerPin[];
      } catch {
        this._pins = [];
      }
    } else this._pins = list || [];
    this._renderPins();
  }
  get pins(): ViewerPin[] {
    return this._pins;
  }
  set activePin(id: string | null) {
    this._active = id;
    this._renderPins();
  }

  private _resize(): void {
    if (!this._renderer || !this._camera) return;
    const w = this.clientWidth || 1;
    const h = this.clientHeight || 1;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  private _load(): void {
    const src = this.getAttribute("src");
    const scene = this._scene;
    const camera = this._camera;
    const controls = this._controls;
    if (!src || !scene || !camera || !controls) return;
    if (this._model) {
      scene.remove(this._model);
      this._model = null;
    }
    this._loading.style.opacity = "1";
    this._loading.textContent = "Loading model";
    this._poster.style.opacity = "1";
    new GLTFLoader().load(
      src,
      (g) => {
        const m = g.scene;
        this._model = m;
        scene.add(m);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        m.position.sub(center);
        const d = Math.max(size.x, size.y, size.z);
        camera.position.set(d * 1.1, d * 0.6, d * 1.5);
        camera.near = d / 100;
        camera.far = d * 20;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.minDistance = d * 0.4;
        controls.maxDistance = d * 5;
        controls.update();
        this._loading.style.opacity = "0";
        this._poster.style.opacity = "0";
        this.dispatchEvent(new CustomEvent("nk-loaded", { bubbles: true }));
      },
      (p) => {
        if (p.total) this._loading.textContent = `Loading model · ${Math.round((p.loaded / p.total) * 100)}%`;
      },
      () => {
        this._loading.textContent = "Model did not load. Showing the last render.";
      },
    );
  }

  private _dropPin(e: PointerEvent): void {
    if (!this._model || !this._camera) return;
    const rect = this._canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this._camera);
    const hit = this._ray.intersectObject(this._model, true)[0];
    if (!hit) return;
    this.dispatchEvent(new CustomEvent("nk-pin", { bubbles: true, detail: { pos: [hit.point.x, hit.point.y, hit.point.z] } }));
  }

  private _renderPins(): void {
    const layer = this._pinLayer;
    layer.innerHTML = "";
    this._pinEls = this._pins.map((p, i) => {
      const el = document.createElement("div");
      el.className = `pin${p.id === this._active ? " active" : ""}`;
      el.textContent = String(i + 1);
      el.onclick = (ev) => {
        ev.stopPropagation();
        this.dispatchEvent(new CustomEvent("nk-pin-select", { bubbles: true, detail: { id: p.id } }));
      };
      layer.appendChild(el);
      return el;
    });
  }

  private _tick(): void {
    this._raf = requestAnimationFrame(() => this._tick());
    const renderer = this._renderer;
    const scene = this._scene;
    const camera = this._camera;
    if (!renderer || !scene || !camera) return;
    this._controls?.update();
    renderer.render(scene, camera);
    if (!this._pinEls.length) return;
    const w = this.clientWidth;
    const h = this.clientHeight;
    const camPos = camera.position;
    this._pins.forEach((p, i) => {
      const v = new THREE.Vector3(...p.pos);
      const el = this._pinEls[i];
      if (!el) return;
      let occluded = false;
      if (this._model) {
        const dir = v.clone().sub(camPos);
        const dist = dir.length();
        this._ray.set(camPos, dir.normalize());
        const hit = this._ray.intersectObject(this._model, true)[0];
        occluded = !!hit && hit.distance < dist - 0.02;
      }
      v.project(camera);
      el.style.left = `${((v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - v.y) / 2) * h}px`;
      el.classList.toggle("hidden", occluded);
    });
  }
}

export function defineViewer(): void {
  if (typeof customElements !== "undefined" && !customElements.get("nk-viewer")) customElements.define("nk-viewer", NkViewer);
}
