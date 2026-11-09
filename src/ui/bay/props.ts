/**
 * Low-poly resus bay built from three.js primitives (no model files): room,
 * bed, patient, monitor, drip stand and crash trolley. Units are metres;
 * the bed runs along x with the head at -x, and the camera looks from +z.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import type { BayTarget } from './bayModel.ts';
import { SCREEN_H, SCREEN_W } from './screen.ts';

export const RECLINE = 0.5;

const lambert = (color: number, extra: Partial<{ transparent: boolean; opacity: number }> = {}) =>
  new MeshLambertMaterial({ color, ...extra });

function mesh(
  geo: BufferGeometry,
  mat: Material,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

function target(name: BayTarget): Group {
  const g = new Group();
  g.userData['target'] = name;
  g.name = name;
  return g;
}

const ALONG_X: [number, number, number] = [0, 0, Math.PI / 2];

export interface RoomParts {
  floor: MeshLambertMaterial;
  wall: MeshLambertMaterial;
}

export function buildRoom(root: Group): RoomParts {
  const floor = lambert(0xbcc8c5);
  const wall = lambert(0xf4f7f6);
  root.add(mesh(new PlaneGeometry(9, 9), floor, [0, 0, 0], [-Math.PI / 2, 0, 0]));
  root.add(mesh(new PlaneGeometry(9, 3.2), wall, [0, 1.6, -1.05]));
  root.add(mesh(new BoxGeometry(3.6, 0.1, 0.05), lambert(0xb9c6c3), [0, 1.22, -1.02]));
  const shadow = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
  root.add(mesh(new PlaneGeometry(2.2, 1.1), shadow, [0, 0.003, 0], [-Math.PI / 2, 0, 0]));
  root.add(mesh(new CircleGeometry(0.42, 20), shadow, [1.45, 0.003, 0.6], [-Math.PI / 2, 0, 0]));
  return { floor, wall };
}

export function buildBed(root: Group): Group {
  const metal = lambert(0x9aa6ab);
  const dark = lambert(0x5d666b);
  const sheet = lambert(0xf1f5f6);
  root.add(mesh(new BoxGeometry(2.05, 0.1, 0.92), metal, [0, 0.45, 0]));
  for (const x of [-0.92, 0.92]) {
    for (const z of [-0.38, 0.38]) {
      root.add(mesh(new CylinderGeometry(0.025, 0.025, 0.36, 8), dark, [x, 0.24, z]));
      root.add(
        mesh(new CylinderGeometry(0.05, 0.05, 0.04, 12), dark, [x, 0.05, z], [Math.PI / 2, 0, 0]),
      );
    }
  }
  root.add(mesh(new BoxGeometry(1.25, 0.14, 0.84), sheet, [0.36, 0.57, 0]));
  root.add(mesh(new BoxGeometry(0.05, 0.55, 0.92), metal, [-1.03, 0.75, 0]));
  root.add(mesh(new BoxGeometry(0.05, 0.38, 0.92), metal, [1.03, 0.66, 0]));
  for (const z of [-0.47, 0.47]) {
    root.add(mesh(new BoxGeometry(1.0, 0.04, 0.03), metal, [0.3, 0.8, z]));
    for (const x of [-0.15, 0.75])
      root.add(mesh(new BoxGeometry(0.03, 0.2, 0.03), metal, [x, 0.7, z]));
  }
  // The head section tilts up around this pivot.
  const back = new Group();
  back.position.set(-0.27, 0.57, 0);
  back.add(mesh(new BoxGeometry(0.72, 0.14, 0.84), sheet, [-0.36, 0, 0]));
  back.add(mesh(new BoxGeometry(0.3, 0.08, 0.5), lambert(0xffffff), [-0.52, 0.11, 0]));
  root.add(back);
  return back;
}

export interface PatientParts {
  head: Group;
  body: Group;
  upper: Group;
  chest: Group;
  skin: MeshLambertMaterial[];
  eyes: Mesh[];
  pads: Group;
  mask: Mesh;
  nasal: Mesh;
  bag: Mesh;
  cannula: Mesh;
}

export function buildPatient(root: Group): PatientParts {
  const skinHead = lambert(0xc99169);
  const skinArms = lambert(0xc99169);
  const gown = lambert(0x8fb4c9);
  const body = target('body');
  const head = target('head');
  // Legs under the blanket stay flat; the upper body tilts with the bed.
  body.add(mesh(new BoxGeometry(1.15, 0.16, 0.6), lambert(0x5f8fb0), [0.36, 0.72, 0]));
  body.add(mesh(new BoxGeometry(0.16, 0.12, 0.5), lambert(0x5f8fb0), [0.88, 0.82, 0]));
  const upper = new Group();
  upper.position.set(-0.27, 0.66, 0);
  const chest = new Group();
  chest.position.set(-0.3, 0.12, 0);
  chest.add(mesh(new CapsuleGeometry(0.17, 0.32, 6, 14), gown, [0, 0, 0], ALONG_X));
  const pads = new Group();
  const padMat = lambert(0x30373b);
  pads.add(mesh(new BoxGeometry(0.11, 0.012, 0.15), padMat, [-0.08, 0.17, -0.07]));
  pads.add(mesh(new BoxGeometry(0.11, 0.012, 0.15), padMat, [0.08, 0.15, 0.12]));
  chest.add(pads);
  const bodyUpper = new Group();
  bodyUpper.userData['target'] = 'body';
  bodyUpper.add(chest);
  for (const z of [-0.23, 0.23]) {
    bodyUpper.add(mesh(new CapsuleGeometry(0.055, 0.12, 4, 10), gown, [-0.44, 0.1, z], ALONG_X));
    bodyUpper.add(
      mesh(new CapsuleGeometry(0.045, 0.28, 4, 10), skinArms, [-0.17, 0.07, z], ALONG_X),
    );
  }
  const cannula = mesh(new BoxGeometry(0.05, 0.02, 0.03), lambert(0xf4f4f4), [-0.1, 0.12, 0.23]);
  bodyUpper.add(cannula);
  upper.add(bodyUpper);

  head.add(mesh(new CylinderGeometry(0.05, 0.05, 0.1, 10), skinHead, [-0.55, 0.14, 0], ALONG_X));
  head.add(mesh(new SphereGeometry(0.12, 18, 14), skinHead, [-0.68, 0.16, 0]));
  head.add(mesh(new SphereGeometry(0.026, 8, 6), skinHead, [-0.66, 0.285, 0]));
  const hair = new SphereGeometry(0.127, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  head.add(mesh(hair, lambert(0x2b211c), [-0.745, 0.16, 0], [0, 0, Math.PI / 2]));
  const eyeMat = lambert(0x231a16);
  const eyes = [-0.045, 0.045].map((z) =>
    mesh(new SphereGeometry(0.017, 8, 6), eyeMat, [-0.695, 0.272, z]),
  );
  for (const e of eyes) head.add(e);
  const o2 = lambert(0x7fd9a8, { transparent: true, opacity: 0.6 });
  const mask = mesh(
    new SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    o2,
    [-0.64, 0.25, 0],
  );
  const nasal = mesh(
    new CapsuleGeometry(0.008, 0.16, 2, 6),
    o2,
    [-0.64, 0.27, 0],
    [Math.PI / 2, 0, 0],
  );
  const bag = mesh(
    new CapsuleGeometry(0.06, 0.14, 4, 10),
    lambert(0x2f8f6f),
    [-0.62, 0.4, 0],
    ALONG_X,
  );
  head.add(mask, nasal, bag);
  upper.add(head);
  root.add(body, upper);
  return {
    head,
    body,
    upper,
    chest,
    skin: [skinHead, skinArms],
    eyes,
    pads,
    mask,
    nasal,
    bag,
    cannula,
  };
}

export function buildMonitor(root: Group, texture: Texture): Group {
  const g = target('monitor');
  g.position.set(-0.95, 1.5, -0.82);
  g.rotation.y = 0.45;
  g.add(mesh(new BoxGeometry(0.64, 0.44, 0.08), lambert(0x2a3338), [0, 0, 0]));
  const screen = new MeshBasicMaterial({ map: texture });
  g.add(mesh(new PlaneGeometry(0.58, (0.58 * SCREEN_H) / SCREEN_W), screen, [0, 0, 0.041]));
  root.add(mesh(new BoxGeometry(0.06, 0.06, 0.24), lambert(0x9aa6ab), [-1.0, 1.5, -0.95]));
  root.add(g);
  return g;
}

export interface DripParts {
  group: Group;
  bag: Group;
  line: Mesh;
}

export function buildDripStand(root: Group): DripParts {
  const g = target('iv');
  const x = -0.8;
  const z = 0.78;
  const metal = lambert(0xb4bec2);
  g.add(mesh(new CylinderGeometry(0.26, 0.26, 0.03, 16), lambert(0x5d666b), [x, 0.04, z]));
  g.add(mesh(new CylinderGeometry(0.015, 0.015, 1.9, 8), metal, [x, 0.98, z]));
  g.add(mesh(new BoxGeometry(0.3, 0.015, 0.015), metal, [x, 1.9, z]));
  const bag = new Group();
  bag.add(
    mesh(
      new BoxGeometry(0.13, 0.22, 0.045),
      lambert(0xeaf4f8, { transparent: true, opacity: 0.85 }),
      [x + 0.12, 1.74, z],
    ),
  );
  bag.add(mesh(new BoxGeometry(0.1, 0.13, 0.035), lambert(0xa9d8ec), [x + 0.12, 1.7, z]));
  bag.add(
    mesh(new CylinderGeometry(0.015, 0.015, 0.06, 8), lambert(0xeaf4f8), [x + 0.12, 1.58, z]),
  );
  g.add(bag);
  const curve = new CatmullRomCurve3([
    new Vector3(x + 0.12, 1.55, z),
    new Vector3(x + 0.05, 1.1, z - 0.05),
    new Vector3(-0.45, 0.9, 0.5),
    new Vector3(-0.36, 0.8, 0.25),
  ]);
  const line = mesh(new TubeGeometry(curve, 24, 0.006, 5), lambert(0xe7eef0), [0, 0, 0]);
  g.add(line);
  root.add(g);
  return { group: g, bag, line };
}

export function buildCart(root: Group): Group {
  const g = target('cart');
  g.position.set(1.45, 0, 0.6);
  g.rotation.y = -0.5;
  g.add(mesh(new BoxGeometry(0.56, 0.8, 0.46), lambert(0xc8433a), [0, 0.5, 0]));
  const trim = lambert(0x7d2621);
  for (const y of [0.3, 0.5, 0.7])
    g.add(mesh(new BoxGeometry(0.52, 0.012, 0.01), trim, [0, y, 0.232]));
  const handle = lambert(0xd9dfe1);
  for (const y of [0.4, 0.6, 0.8])
    g.add(mesh(new BoxGeometry(0.16, 0.02, 0.02), handle, [0, y, 0.24]));
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.18, 0.18]) {
      g.add(
        mesh(
          new CylinderGeometry(0.045, 0.045, 0.04, 12),
          lambert(0x30373b),
          [x, 0.05, z],
          [Math.PI / 2, 0, 0],
        ),
      );
    }
  }
  g.add(mesh(new BoxGeometry(0.4, 0.15, 0.3), lambert(0x3a4247), [0, 0.98, 0]));
  g.add(
    mesh(
      new PlaneGeometry(0.18, 0.1),
      new MeshBasicMaterial({ color: 0x1c3b2a }),
      [-0.06, 0.99, 0.151],
    ),
  );
  g.add(mesh(new BoxGeometry(0.06, 0.06, 0.02), lambert(0xf2c94c), [0.12, 0.99, 0.155]));
  root.add(g);
  return g;
}

export function buildOutlet(root: Group): Group {
  const g = target('oxygen');
  g.add(mesh(new BoxGeometry(0.12, 0.14, 0.04), lambert(0xffffff), [-0.45, 1.22, -0.99]));
  g.add(
    mesh(
      new CylinderGeometry(0.025, 0.025, 0.05, 10),
      lambert(0x2e9a5c),
      [-0.45, 1.22, -0.96],
      [Math.PI / 2, 0, 0],
    ),
  );
  g.add(mesh(new BoxGeometry(0.12, 0.14, 0.04), lambert(0xffffff), [-0.25, 1.22, -0.99]));
  g.add(
    mesh(
      new CylinderGeometry(0.025, 0.025, 0.05, 10),
      lambert(0xe6c229),
      [-0.25, 1.22, -0.96],
      [Math.PI / 2, 0, 0],
    ),
  );
  root.add(g);
  return g;
}

/** Highlight on hover by lifting the emissive colour of a target's materials. */
export function setHighlight(groups: readonly Group[], on: boolean): void {
  for (const g of groups) {
    g.traverse((o) => {
      const m = (o as Mesh).material;
      if (m instanceof MeshLambertMaterial) m.emissive.setHex(on ? 0x2a3a3a : 0x000000);
    });
  }
}
