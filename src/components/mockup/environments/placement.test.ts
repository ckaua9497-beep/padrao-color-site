import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MOCKUP_KINDS, type MockupKind } from "../../../lib/mockup-kinds.ts";
import { ROOM_CONTACT, ROOM_DROP, ROOM_SHELF, SOFA, roomLayout } from "./layout.ts";
import { environmentFor, roomsFor, type RoomId } from "./presets.ts";
import { placeInRoom, studioYaw, unitsPerCm } from "./placement.ts";

type Spec = { kind: MockupKind; variant: string | null; widthCm: number; heightCm: number };

const VARIANTS = [null, "desk", "calendar", "mosaic", "door-sign", "pet-tag", "body", "cover", "coloring", "doormat", "beach", "canga", "face", "hand", "fitness", "picnic", "mini", "strip", "fabric", "raw", "frame"];

function spec(kind: MockupKind, widthCm: number, heightCm: number, variant: string | null = null): Spec {
  return { kind, variant, widthCm, heightCm };
}

/** Grupo do palco com o modelo: um bloco de w × h × d cm na escala `upc` (unidades por cm). */
function model(widthCm: number, heightCm: number, depthCm: number, upc: number, options: { declare?: boolean; yaw?: number; extra?: THREE.Object3D } = {}) {
  const stage = new THREE.Group();
  const root = new THREE.Group();
  if (options.declare) root.userData = { unitsPerCm: upc, roomPose: true };
  root.rotation.y = options.yaw ?? 0;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(widthCm * upc, heightCm * upc, depthCm * upc)));
  if (options.extra) root.add(options.extra);
  stage.add(root);
  return stage;
}

function room() {
  const group = new THREE.Group();
  for (const name of [ROOM_DROP, ROOM_CONTACT]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    mesh.visible = false;
    group.add(mesh);
  }
  const shelf = new THREE.Group();
  shelf.name = ROOM_SHELF;
  shelf.visible = false;
  group.add(shelf);
  return group;
}

/** Ponto da cena em metros da sala. */
function toRoom(group: THREE.Object3D, point: THREE.Vector3) {
  return point.clone().sub(group.position).divideScalar(group.scale.x);
}

const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) <= eps;

test("toda sala oferecida tem âncora para a regra da peça", () => {
  for (const kind of MOCKUP_KINDS) {
    for (const variant of VARIANTS) {
      const s = spec(kind, 40, 30, variant);
      for (const id of roomsFor(s)) {
        const env = environmentFor(s, id);
        const anchor = roomLayout(env).anchors[env.placement.spot];
        assert.ok(anchor, `${kind}/${variant} em ${id}: sem âncora "${env.placement.spot}"`);
      }
    }
  }
});

test("só tipos que fazem sentido ganham ambiente", () => {
  assert.deepEqual(roomsFor(spec("mug", 20, 8.5)), []);
  assert.deepEqual(roomsFor(spec("panel", 22, 8.2, "door-sign")), []);
  assert.ok(roomsFor(spec("canvas", 40, 30)).includes("living"));
  assert.ok(roomsFor(spec("cushion", 40, 40)).includes("bedroom"));
  assert.deepEqual(roomsFor(spec("bedding", 140, 200)), ["bedroom"]);
});

test("escala da peça: declarada, escala do grupo raiz ou encaixe padrão", () => {
  assert.ok(near(unitsPerCm(model(40, 30, 3, 0.06, { declare: true }), spec("canvas", 40, 30)), 0.06, 1e-9));
  const scaled = new THREE.Group();
  const root = new THREE.Group();
  root.scale.setScalar(0.0173);
  scaled.add(root);
  assert.ok(near(unitsPerCm(scaled, spec("bedding", 140, 200)), 0.0173, 1e-9));
  assert.ok(near(unitsPerCm(model(60, 30, 1, 1), spec("neon", 60, 30)), 2.4 / 60, 1e-9));
  assert.ok(near(unitsPerCm(model(80, 200, 1, 1), spec("rollup", 80, 200)), 2.6 / 200, 1e-9));
});

test("giro de 3/4 do estúdio é desfeito, salvo em modelo que já posa sozinho", () => {
  const stage = new THREE.Group();
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.y = 0.2;
  inner.add(new THREE.Mesh(), new THREE.Mesh());
  outer.add(inner);
  stage.add(outer);
  assert.ok(near(studioYaw(stage), 0.2, 1e-9));
  outer.userData.roomPose = true;
  assert.equal(studioYaw(stage), 0);
});

test("quadro de 40 × 30 cm: na parede, centro na altura do olhar, em escala real, acima do sofá", () => {
  const s = spec("canvas", 40, 30);
  const upc = 2.4 / 40;
  const env = environmentFor(s, "living");
  const stage = model(40, 30, 3, upc, { declare: true });
  const group = room();
  const placed = placeInRoom(stage, group, env, s);
  assert.ok(placed);
  assert.ok(near(group.scale.x, upc * 100, 1e-9), "sala na escala da peça");
  const anchor = roomLayout(env).anchors.wall;
  assert.ok(anchor);
  const center = toRoom(group, new THREE.Vector3());
  assert.ok(near(center.x, anchor.x), `centro x ${center.x}`);
  assert.ok(near(center.y, 1.5), `centro y ${center.y}`);
  const lo = toRoom(group, placed.box.min);
  const hi = toRoom(group, placed.box.max);
  assert.ok(near(hi.x - lo.x, 0.4) && near(hi.y - lo.y, 0.3), "40 × 30 cm em metros da sala");
  assert.ok(lo.z > 0 && lo.z < 0.005, `costas na parede (${lo.z})`);
  assert.ok(lo.y > SOFA.back + 0.2, "acima do encosto do sofá");
  assert.equal(group.getObjectByName(ROOM_DROP)?.visible, true, "sombra macia na parede");
  assert.equal(group.getObjectByName(ROOM_SHELF)?.visible, false);
  const product = placed.box.getBoundingSphere(new THREE.Sphere()).radius;
  assert.ok(placed.radius >= product * 1.29 && placed.radius <= product * 3.01, "a peça continua legível no enquadramento");
});

test("neon: desfaz o giro, centro no olhar, prateleira para a fonte e sem sombra (cena noturna)", () => {
  const s = spec("neon", 60, 30);
  const upc = 2.4 / 60;
  const dimmer = new THREE.Mesh(new THREE.BoxGeometry(9 * upc, 2.4 * upc, 4.2 * upc));
  dimmer.position.set(15 * upc, -15 * upc - 12 * upc + 1.2 * upc, 0);
  const stage = model(60, 30, 0.5, upc, { yaw: 0.22, extra: dimmer });
  const env = environmentFor(s, "living");
  assert.equal(env.night, true);
  const group = room();
  const placed = placeInRoom(stage, group, env, s);
  assert.ok(placed);
  assert.ok(near(stage.rotation.y, -0.22, 1e-9), "peça reta na parede");
  assert.ok(near(toRoom(group, new THREE.Vector3()).y, 1.5));
  assert.equal(group.getObjectByName(ROOM_SHELF)?.visible, true, "prateleira embaixo da placa");
  assert.equal(group.getObjectByName(ROOM_DROP)?.visible, false);
});

test("almofada no sofá: apoiada no assento e encostada no encosto", () => {
  const s = spec("cushion", 40, 40);
  const upc = 2.3 / 40;
  const env = environmentFor(s, "living");
  assert.equal(env.placement.surface, "seat");
  const group = room();
  const placed = placeInRoom(model(40, 40, 13, upc, { declare: true }), group, env, s);
  assert.ok(placed);
  const anchor = roomLayout(env).anchors.seat;
  assert.ok(anchor);
  const lo = toRoom(group, placed.box.min);
  assert.ok(near(lo.y, SOFA.seatTop - 0.03), `afunda um pouco no assento (${lo.y})`);
  assert.ok(near(lo.z, anchor.z), `encostada (${lo.z})`);
  const contact = group.getObjectByName(ROOM_CONTACT);
  assert.equal(contact?.visible, true);
  assert.ok(contact && contact.position.y > SOFA.seatTop, "sombra em cima do estofado");
});

test("almofada de corpo: deitada no edredom, no meio da cama", () => {
  const s = spec("cushion", 150, 30, "body");
  const upc = 2.8 / 150;
  const env = environmentFor(s, "bedroom");
  assert.equal(env.placement.lying, true);
  const group = room();
  const placed = placeInRoom(model(150, 13, 30, upc, { declare: true }), group, env, s);
  assert.ok(placed);
  const anchor = roomLayout(env).anchors.bed;
  assert.ok(anchor?.lieY !== undefined && anchor.lie !== undefined);
  const lo = toRoom(group, placed.box.min);
  const mid = toRoom(group, placed.box.getCenter(new THREE.Vector3()));
  assert.ok(near(lo.y, anchor.lieY - 0.015), `no edredom (${lo.y})`);
  assert.ok(near(mid.z, anchor.lie) && near(mid.x, 0), "no meio da cama");
});

test("papel de parede: cobre largura × altura do pedido a partir do chão, na parede", () => {
  const s = spec("wallpaper", 300, 280);
  const upc = 2.8 / 300;
  const env = environmentFor(s, "bedroom");
  assert.ok(env.width >= 3 + 1.4 - 1e-9 && env.height >= 2.8 - 1e-9, "a sala cresce com o papel");
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(300 * upc, 280 * upc));
  paper.position.y = 140 * upc;
  const stage = new THREE.Group();
  const root = new THREE.Group();
  root.userData = { unitsPerCm: upc, roomPose: true };
  root.add(paper);
  stage.add(root);
  const group = room();
  const placed = placeInRoom(stage, group, env, s);
  assert.ok(placed);
  const lo = toRoom(group, placed.box.min);
  const hi = toRoom(group, placed.box.max);
  assert.ok(near(lo.y, 0) && near(hi.y, 2.8), `do chão até 2,8 m (${lo.y}–${hi.y})`);
  assert.ok(near(hi.x - lo.x, 3), "3 m de largura");
  assert.ok(lo.z >= 0 && lo.z < 0.003, "colado na parede");
});

test("tapete no chão, à frente do sofá", () => {
  const s = spec("rug", 90, 40);
  const upc = 2.4 / 90;
  const flat = new THREE.Group();
  const root = new THREE.Group();
  const rug = new THREE.Mesh(new THREE.BoxGeometry(90 * upc, 0.7 * upc, 40 * upc));
  rug.position.y = 0.35 * upc;
  root.add(rug);
  flat.add(root);
  const env = environmentFor(s, "living" satisfies RoomId);
  const group = room();
  const placed = placeInRoom(flat, group, env, s);
  assert.ok(placed);
  const anchor = roomLayout(env).anchors.floor;
  assert.ok(anchor);
  const lo = toRoom(group, placed.box.min);
  assert.ok(near(lo.y, 0.002), "no chão");
  assert.ok(near(lo.z, anchor.z), "borda de trás à frente do sofá");
  assert.equal(placed.dims?.flat, true, "cotas deitadas no tapete");
});
