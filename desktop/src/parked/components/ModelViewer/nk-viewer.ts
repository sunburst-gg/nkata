// The nk-viewer web component from handoff/v3/nk-viewer.js, ported as is to TypeScript.
// Orbit, zoom, pan, a poster while the GLB loads, progress, and comment pins that project to
// the screen each frame and fade when the mesh hides them. Events: nk-loaded, nk-pin (a click in
// pinning mode, detail.pos), nk-pin-select (detail.id). three.js, bundled by Vite; no network.
// https://threejs.org/docs/
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
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
const WALK_HINT = "W A S D to move · Mouse to look · Esc to stop";
/** Eye height and pace for walking a level area, in meters: the exporter writes meters. */
const EYE_HEIGHT = 1.7;
const WALK_SPEED = 3.2;

export class NkViewer extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["src", "pinning", "bg", "poster", "pins", "active-pin", "activepin", "mode"];
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
  private _walk: PointerLockControls | null = null;
  private _keys = new Set<string>();
  private _lastTick = 0;
  private _walking = false;

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
      if (this._walking) {
        // Locked pointer: a click pins at the center of the view.
        if (this._walk?.isLocked && this._pinOn) this._dropPinAt(0, 0);
        else if (!this._walk?.isLocked) this._walk?.lock();
        return;
      }
      if (moved < 4 && this._pinOn) this._dropPin(e);
    });
    // Walking: the keys come from the document so the canvas needs no focus.
    document.addEventListener("keydown", this._onKey);
    document.addEventListener("keyup", this._onKey);
    this._resize();
    this._load();
    this._tick();
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    document.removeEventListener("keydown", this._onKey);
    document.removeEventListener("keyup", this._onKey);
    this._walk?.unlock();
    this._renderer?.dispose();
  }

  private readonly _onKey = (e: KeyboardEvent): void => {
    if (!this._walking) return;
    if (e.type === "keydown") this._keys.add(e.code);
    else this._keys.delete(e.code);
  };

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
    if (name === "mode") this._setMode(value === "walk");
  }

  /** Orbit around the model, or walk through it first person (a level area). */
  private _setMode(walk: boolean): void {
    if (walk === this._walking) return;
    const camera = this._camera;
    const controls = this._controls;
    if (!camera || !controls) { this._walking = walk; return; }
    this._walking = walk;
    this._keys.clear();
    if (walk) {
      controls.enabled = false;
      if (!this._walk) {
        this._walk = new PointerLockControls(camera, this._canvas);
        this._walk.addEventListener("unlock", () => this.dispatchEvent(new CustomEvent("nk-walk-end", { bubbles: true })));
      }
      this._standUp();
      this._hint.textContent = WALK_HINT;
      this._canvas.style.cursor = "crosshair";
      this._lastTick = performance.now();
      this._walk.lock();
    } else {
      this._walk?.unlock();
      controls.enabled = true;
      this._hint.textContent = this._pinOn ? PIN_HINT : ORBIT_HINT;
      this._canvas.style.cursor = this._pinOn ? "crosshair" : "";
      if (this._model) this._frame(this._model);
    }
  }

  /** Puts the camera at eye height on the floor under the model's center, looking across it. */
  private _standUp(): void {
    const camera = this._camera;
    const model = this._model;
    if (!camera || !model) return;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const floor = this._floorUnder(center.x, box.max.y + 1, center.z) ?? box.min.y;
    camera.position.set(center.x, floor + EYE_HEIGHT, center.z);
    camera.lookAt(center.x, floor + EYE_HEIGHT, center.z - 1);
    camera.near = 0.05;
    camera.far = Math.max(100, box.getSize(new THREE.Vector3()).length() * 4);
    camera.updateProjectionMatrix();
  }

  /** The floor height under a point: the first mesh hit looking down, or null in the void. */
  private _floorUnder(x: number, fromY: number, z: number): number | null {
    if (!this._model) return null;
    this._ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    const hit = this._ray.intersectObject(this._model, true)[0];
    return hit ? hit.point.y : null;
  }

  private _step(dt: number): void {
    const walk = this._walk;
    const camera = this._camera;
    if (!walk || !camera || !walk.isLocked) return;
    const fast = this._keys.has("ShiftLeft") || this._keys.has("ShiftRight");
    const speed = WALK_SPEED * (fast ? 2.5 : 1) * dt;
    const forward = (this._keys.has("KeyW") || this._keys.has("ArrowUp") ? 1 : 0) - (this._keys.has("KeyS") || this._keys.has("ArrowDown") ? 1 : 0);
    const right = (this._keys.has("KeyD") || this._keys.has("ArrowRight") ? 1 : 0) - (this._keys.has("KeyA") || this._keys.has("ArrowLeft") ? 1 : 0);
    if (forward) walk.moveForward(forward * speed);
    if (right) walk.moveRight(right * speed);
    // Stay at eye height over whatever is under foot; in the void, keep the last height.
    const floor = this._floorUnder(camera.position.x, camera.position.y + 0.5, camera.position.z);
    if (floor !== null) {
      const want = floor + EYE_HEIGHT;
      camera.position.y += (want - camera.position.y) * Math.min(1, dt * 12);
    }
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
        const center = box.getCenter(new THREE.Vector3());
        m.position.sub(center);
        if (this._walking) this._standUp();
        else this._frame(m);
        this._loading.style.opacity = "0";
        this._poster.style.opacity = "0";
        this.dispatchEvent(new CustomEvent("nk-loaded", { bubbles: true }));
      },
      (p) => {
        if (p.total) this._loading.textContent = `Loading model · ${Math.round((p.loaded / p.total) * 100)}%`;
      },
      (err) => {
        // The reason stays on screen: a blocked fetch and a bad file read differently.
        const why = err instanceof Error && err.message ? err.message : "";
        this._loading.textContent = `Model did not load${why ? `: ${why}` : ""}. Showing the last render.`;
      },
    );
  }

  /** Frames the model for orbit: a three quarter view with the whole model in sight. */
  private _frame(m: THREE.Object3D): void {
    const camera = this._camera;
    const controls = this._controls;
    if (!camera || !controls) return;
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) || 1;
    camera.position.set(d * 1.1, d * 0.6, d * 1.5);
    camera.near = d / 100;
    camera.far = d * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = d * 0.4;
    controls.maxDistance = d * 5;
    controls.update();
  }

  private _dropPin(e: PointerEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    this._dropPinAt(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private _dropPinAt(x: number, y: number): void {
    if (!this._model || !this._camera) return;
    const ndc = new THREE.Vector2(x, y);
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
    const now = performance.now();
    if (this._walking) this._step(Math.min(0.1, (now - this._lastTick) / 1000));
    else this._controls?.update();
    this._lastTick = now;
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
