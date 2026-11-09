/**
 * The 3D resus bay: renderer, camera, orbit, picking and the render loop.
 * State comes in through setState(); clicks and hovers go out through the
 * callbacks. Kept small and low-poly so it holds frame rate on modest GPUs.
 */
import {
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LinearFilter,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { traceCanvas } from '../monitor/traceSource.ts';
import { breathScale, type BayState, type BayTarget } from './bayModel.ts';
import {
  buildBed,
  buildCart,
  buildDripStand,
  buildMonitor,
  buildOutlet,
  buildPatient,
  buildRoom,
  RECLINE,
  setHighlight,
  type DripParts,
  type PatientParts,
  type RoomParts,
} from './props.ts';
import { drawScreen, SCREEN_H, SCREEN_W, type ScreenReading } from './screen.ts';

export interface BayOptions {
  dark: boolean;
  onHover(target: BayTarget | null, x: number, y: number): void;
  onPick(target: BayTarget): void;
  onFps?(fps: number): void;
  readScreen(): ScreenReading | null;
}

/** Monitor screen refreshes per second. */
const SCREEN_HZ = 12;
/** Pointer travel (px) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 6;

const THEMES = {
  light: { floor: 0xbcc8c5, wall: 0xf4f7f6 },
  dark: { floor: 0x2b3638, wall: 0x3a4846 },
};

export class Bay {
  private readonly canvas: HTMLCanvasElement;
  private readonly opts: BayOptions;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1.6, 0.1, 30);
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly targets = new Map<BayTarget, Group[]>();
  private readonly room: RoomParts;
  private readonly back: Group;
  private readonly patient: PatientParts;
  private readonly drip: DripParts;
  private readonly screenCtx: CanvasRenderingContext2D | null;
  private readonly screenTex: CanvasTexture;
  private state: BayState | null = null;
  private recline = RECLINE;
  private t = 0;
  private last = 0;
  private screenAcc = 1;
  private fpsFrames = 0;
  private fpsAcc = 0;
  private hovered: BayTarget | null = null;
  private down: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, opts: BayOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const screen = document.createElement('canvas');
    screen.width = SCREEN_W;
    screen.height = SCREEN_H;
    this.screenCtx = screen.getContext('2d');
    this.screenTex = new CanvasTexture(screen);
    this.screenTex.colorSpace = SRGBColorSpace;
    this.screenTex.minFilter = LinearFilter;
    this.screenTex.generateMipmaps = false;

    const root = new Group();
    this.room = buildRoom(root);
    this.back = buildBed(root);
    this.patient = buildPatient(root);
    buildMonitor(root, this.screenTex);
    this.drip = buildDripStand(root);
    buildCart(root);
    buildOutlet(root);
    this.scene.add(root);
    root.traverse((o) => {
      const t = o.userData['target'] as BayTarget | undefined;
      if (t) this.targets.set(t, [...(this.targets.get(t) ?? []), o as Group]);
    });

    this.scene.add(new HemisphereLight(0xffffff, 0x7d8c8a, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 4, 3);
    // A soft fill from the viewer's side lifts the back wall and faces.
    const fill = new DirectionalLight(0xffffff, 0.9);
    fill.position.set(0.5, 1.5, 5);
    this.scene.add(sun, fill);

    this.camera.position.set(1.7, 1.85, 2.55);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(-0.15, 0.85, 0);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 1.4;
    this.controls.minAzimuthAngle = -1.0;
    this.controls.maxAzimuthAngle = 1.2;
    this.controls.update();
    // Let vertical swipes scroll the page on phones; horizontal drags orbit.
    canvas.style.touchAction = 'pan-y';

    this.setTheme(opts.dark);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
  }

  setActive(on: boolean): void {
    this.last = performance.now();
    this.renderer.setAnimationLoop(on ? this.frame : null);
  }

  resize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const narrow = w / h < 1.4;
    this.camera.fov = narrow ? 50 : 42;
    this.camera.updateProjectionMatrix();
    // Step back on narrow screens so the whole bay stays in frame.
    const dir = this.camera.position.clone().sub(this.controls.target);
    this.camera.position.copy(this.controls.target).add(dir.setLength(narrow ? 3.9 : 3.3));
  }

  setTheme(dark: boolean): void {
    const c = dark ? THEMES.dark : THEMES.light;
    this.room.floor.color.setHex(c.floor);
    this.room.wall.color.setHex(c.wall);
  }

  setState(s: BayState): void {
    this.state = s;
    const p = this.patient;
    for (const m of p.skin) m.color.setHex(s.skin);
    for (const e of p.eyes) e.scale.y = s.eyesClosed ? 0.2 : 1;
    p.pads.visible = s.padsOn;
    p.mask.visible = s.oxygen === 'mask' || s.oxygen === 'bvm';
    p.nasal.visible = s.oxygen === 'nasal';
    p.bag.visible = s.oxygen === 'bvm';
    p.cannula.visible = s.ivAccess;
    this.drip.bag.visible = s.drip;
    this.drip.line.visible = s.drip;
  }

  /** The target under a point in client coordinates, if any. */
  pick(clientX: number, clientY: number): BayTarget | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const groups = [...this.targets.values()].flat();
    for (const hit of this.raycaster.intersectObjects(groups, true)) {
      let o: Object3D | null = hit.object;
      while (o && !o.userData['target']) o = o.parent;
      if (o && o.visible && hit.object.visible) return o.userData['target'] as BayTarget;
    }
    return null;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mats: Material[] = Array.isArray(m.material)
        ? m.material
        : m.material
          ? [m.material]
          : [];
      for (const mat of mats) mat.dispose();
    });
    this.screenTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    const s = this.state;
    if (s) {
      const goal = s.reclined ? RECLINE : 0;
      this.recline += (goal - this.recline) * Math.min(1, dt * 2);
      this.back.rotation.z = -this.recline;
      this.patient.upper.rotation.z = -this.recline;
      const k = breathScale(this.t, s.rr, s.cpr);
      this.patient.chest.scale.set(1, k, 1 + (k - 1) * 0.6);
    }
    this.screenAcc += dt;
    if (this.screenAcc >= 1 / SCREEN_HZ && this.screenCtx) {
      this.screenAcc = 0;
      drawScreen(this.screenCtx, traceCanvas(), this.opts.readScreen());
      this.screenTex.needsUpdate = true;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.fpsFrames += 1;
    this.fpsAcc += dt;
    if (this.fpsAcc >= 1) {
      this.opts.onFps?.(Math.round(this.fpsFrames / this.fpsAcc));
      this.fpsFrames = 0;
      this.fpsAcc = 0;
    }
  };

  private setHover(t: BayTarget | null, x: number, y: number): void {
    if (t !== this.hovered) {
      if (this.hovered) setHighlight(this.targets.get(this.hovered) ?? [], false);
      if (t) setHighlight(this.targets.get(t) ?? [], true);
      this.hovered = t;
      this.canvas.style.cursor = t ? 'pointer' : 'grab';
    }
    this.opts.onHover(t, x, y);
  }

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      this.setHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
    }
  };

  private readonly onDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private readonly onUp = (e: PointerEvent): void => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
    const t = this.pick(e.clientX, e.clientY);
    if (t) this.opts.onPick(t);
  };

  private readonly onLeave = (): void => {
    this.setHover(null, 0, 0);
  };
}
