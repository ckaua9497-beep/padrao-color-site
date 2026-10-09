// Coloca a peça na sala: mede o modelo, acha a escala dele (unidades por cm), escala e move a SALA
// em volta da peça (o modelo continua na escala do estúdio, com a mesma luz e animação), ajusta as
// sombras e a prateleira que dependem da peça e devolve o enquadramento da câmera.

import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { ROOM_CONTACT, ROOM_DROP, ROOM_SHELF, roomLayout } from "./layout.ts";
import type { RoomEnvironment } from "./presets.ts";
import { SOFT_SPREAD } from "./textures.ts";

const point = new THREE.Vector3();

/**
 * Caixa das malhas do modelo, ignorando cotas e rótulos (userData.noBounds, que também somem da sombra e do
 * snapshot) e o que fica fora do enquadramento mas aparece na imagem (userData.noFrame: o interior da loja,
 * visto pelo vidro da fachada).
 */
export function measureBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  const visit = (object: THREE.Object3D) => {
    if (object.userData.noBounds || object.userData.noFrame) return;
    const mesh = object as THREE.Mesh;
    const position = mesh.isMesh ? mesh.geometry?.getAttribute("position") : undefined;
    if (position) {
      for (let i = 0; i < position.count; i += 1) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
    }
    object.children.forEach(visit);
  };
  visit(root);
  return box;
}

/**
 * Unidades da cena por cm real da peça. Ordem: `userData.unitsPerCm` declarado pelo modelo; a escala
 * uniforme do grupo raiz (modelos desenhados em cm); senão o encaixe padrão do estúdio
 * (2,4 unidades no maior lado, como fitFlat).
 */
export function unitsPerCm(model: THREE.Object3D, spec: Pick<MockupSpec, "kind" | "variant" | "widthCm" | "heightCm">): number {
  let declared = 0;
  model.traverse((object) => {
    const value = object.userData.unitsPerCm;
    if (!declared && typeof value === "number" && Number.isFinite(value) && value > 0) declared = value;
  });
  if (declared > 0) return declared;
  const top = model.children[0];
  if (top) {
    const { x, y, z } = top.scale;
    if (Math.abs(x - 1) > 1e-6 && Math.abs(x - y) < x * 1e-4 && Math.abs(x - z) < x * 1e-4) return x;
  }
  const target = spec.kind === "rollup" ? 2.6 : spec.kind === "banner" && spec.variant === "mini" ? 1.9 : 2.4;
  return target / Math.max(spec.widthCm, spec.heightCm, 1);
}

/**
 * Giro de 3/4 do estúdio nos grupos de embrulho do modelo (rotation-y do grupo raiz e dos grupos com
 * um filho só). Na sala ele é desfeito para a peça ficar reta na parede. Modelos que já trocam de
 * pose sozinhos no ambiente (useSceneMode) marcam o grupo raiz com `userData.roomPose`.
 */
export function studioYaw(model: THREE.Object3D): number {
  let yaw = 0;
  let node: THREE.Object3D | undefined = model.children[0];
  if (node?.userData.roomPose) return 0;
  for (let depth = 0; node && depth < 4; depth += 1) {
    if (!(node as THREE.Group).isGroup) break;
    yaw += node.rotation.y;
    if (node.children.length !== 1) break;
    node = node.children[0];
  }
  return yaw;
}

export type RoomPlacement = {
  /** Unidades da cena por cm da peça (as cotas são desenhadas em cm). */
  unitsPerCm: number;
  /** Peça medida, na cena. */
  box: THREE.Box3;
  /** Enquadramento: centro, raio e direção da vista inicial (unitária). */
  center: THREE.Vector3;
  radius: number;
  home: THREE.Vector3;
  /** Onde ficam as cotas: centro do retângulo da arte, se ele está deitado (tapete) e o giro da peça. */
  dims: { position: THREE.Vector3; flat: boolean; yaw: number } | null;
};

const clamp = THREE.MathUtils.clamp;

/**
 * Posiciona a sala em volta da peça. `model` é o grupo do palco com o modelo; `room` é o grupo da sala
 * (em metros). Altera a pose do modelo (tira o 3/4), a escala/posição da sala e os objetos da sala
 * que dependem da peça (sombra na parede, sombra de contato, prateleira do neon).
 */
export function placeInRoom(model: THREE.Object3D, room: THREE.Object3D, env: RoomEnvironment, spec: Pick<MockupSpec, "kind" | "variant" | "widthCm" | "heightCm">): RoomPlacement | null {
  const layout = roomLayout(env);
  const { placement } = env;
  const anchor = layout.anchors[placement.spot];
  model.position.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.rotation.set(0, 0, 0);
  const upc = unitsPerCm(model, spec);
  const u = upc * 100;
  model.rotation.set(0, -studioYaw(model) + placement.yaw, 0);
  const box = measureBox(model);
  if (!anchor || box.isEmpty() || !(u > 0)) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // A arte dos modelos de placa fica centrada na origem do modelo.
  const pivot = placement.pivot === "origin" ? new THREE.Vector3(0, 0, 0) : center.clone();
  const shift = placement.shift ?? 0;
  const origin = new THREE.Vector3();
  const contextX = (anchor.context.min[0] + anchor.context.max[0]) / 2;

  switch (placement.spot) {
    case "wall": {
      // Centro na altura do olhar, sem encostar no móvel (a caixa inteira fica acima de anchor.y)
      // e sem passar do teto.
      const below = (pivot.y - box.min.y) / u;
      const above = (box.max.y - pivot.y) / u;
      let cy = Math.max(anchor.eye ?? 1.5, anchor.y + below);
      cy = Math.min(cy, env.height - 0.1 - above);
      cy = Math.max(cy, below + 0.05);
      origin.set(pivot.x - u * (anchor.x + shift), pivot.y - u * cy, box.min.z - u * 0.002);
      break;
    }
    case "paper":
      // Papel do chão para cima, colado na parede.
      origin.set(center.x - u * anchor.x, box.min.y, box.min.z - u * 0.0012);
      break;
    case "window": {
      const top = Math.min(env.height - 0.04, Math.max((anchor.top ?? 2.2) + 0.18, size.y / u + 0.03));
      origin.set(center.x - u * anchor.x, box.max.y - u * top, box.min.z - u * 0.002);
      break;
    }
    case "towel":
      origin.set(pivot.x - u * anchor.x, pivot.y - u * anchor.y, box.min.z - u * 0.002);
      break;
    case "top":
      origin.set(center.x - u * anchor.x, box.min.y - u * anchor.y, center.z - u * anchor.z);
      break;
    case "seat":
    case "bed": {
      // Afunda um pouco no estofado e encosta no encosto (ou nos travesseiros); a de corpo deita.
      const sink = placement.spot === "seat" ? 0.03 : 0.015;
      const x = placement.lying ? contextX : anchor.x;
      const y = placement.lying ? (anchor.lieY ?? anchor.y) : anchor.y;
      const z = placement.lying ? center.z - u * (anchor.lie ?? anchor.z) : box.min.z - u * anchor.z;
      origin.set(center.x - u * x, box.min.y - u * (y - sink), z);
      break;
    }
    case "floor":
    case "stand":
      // A borda de trás da peça fica em anchor.z: tapete à frente do sofá, cama pet ao lado.
      origin.set(center.x - u * (anchor.x + shift), box.min.y - u * 0.002, box.min.z - u * anchor.z);
      break;
    case "bedframe":
      origin.set(center.x - u * anchor.x, box.min.y, box.min.z - u * anchor.z);
      break;
    case "table":
      origin.set(center.x - u * anchor.x, box.min.y, center.z - u * anchor.z);
      break;
  }
  room.position.copy(origin);
  room.scale.setScalar(u);
  room.rotation.set(0, 0, 0);
  room.updateMatrixWorld(true);

  // Caixa da peça em metros da sala.
  const lo = box.min.clone().sub(origin).divideScalar(u);
  const hi = box.max.clone().sub(origin).divideScalar(u);
  const spot = placement.spot;

  const drop = room.getObjectByName(ROOM_DROP);
  if (drop) {
    // Sombra macia na parede atrás de peça pendurada; o neon é fonte de luz e não ganha sombra.
    const hung = (spot === "wall" || spot === "towel") && !env.night;
    drop.visible = hung;
    if (hung) {
      const away = clamp(hi.z, 0.005, 0.2);
      const offset = 0.01 + away * 0.45;
      drop.position.set((lo.x + hi.x) / 2 + offset * 0.3, (lo.y + hi.y) / 2 - offset, 0.0025);
      drop.scale.set((hi.x - lo.x) * SOFT_SPREAD * (1 + away), (hi.y - lo.y) * SOFT_SPREAD * (1 + away * 0.6), 1);
    }
  }

  const contact = room.getObjectByName(ROOM_CONTACT) as THREE.Mesh | undefined;
  if (contact) {
    const grounded = spot === "seat" || spot === "bed" || spot === "floor" || spot === "stand" || spot === "top" || spot === "bedframe" || spot === "table";
    contact.visible = grounded;
    if (grounded) {
      const thickness = hi.y - lo.y;
      const k = clamp(thickness / 0.3, 0.06, 1);
      // No sofá e na cama a peça afunda no estofado: a sombra fica na superfície, não embaixo da peça.
      const soft = spot === "seat" || spot === "bed";
      const surface = soft ? (placement.lying ? (anchor.lieY ?? anchor.y) : anchor.y) + 0.004 : lo.y + 0.002;
      contact.position.set((lo.x + hi.x) / 2, surface, (lo.z + hi.z) / 2);
      contact.rotation.set(-Math.PI / 2, 0, 0);
      contact.scale.set((hi.x - lo.x) * (1 + 0.6 * k), (hi.z - lo.z) * (1 + 0.6 * k), 1);
      const material = contact.material as THREE.MeshBasicMaterial;
      material.opacity = 0.18 + 0.27 * k;
    }
  }

  const shelf = room.getObjectByName(ROOM_SHELF);
  if (shelf) {
    // Neon: a fonte fica abaixo da placa; uma prateleira flutuante na parede apoia a fonte.
    const printBottom = spot === "wall" && placement.pivot === "origin" ? (pivot.y - (spec.heightCm / 2) * upc - origin.y) / u : -Infinity;
    const hanging = spot === "wall" && lo.y < printBottom - 0.04;
    shelf.visible = hanging;
    if (hanging) shelf.position.set((lo.x + hi.x) / 2, lo.y, 0);
  }

  // Enquadramento: a peça e um pouco do móvel que dá a escala, sem deixar a peça pequena demais.
  const ctxBox = new THREE.Box3(new THREE.Vector3(...anchor.context.min).multiplyScalar(u).add(origin), new THREE.Vector3(...anchor.context.max).multiplyScalar(u).add(origin));
  const product = box.getBoundingSphere(new THREE.Sphere());
  const union = box.clone().union(ctxBox).getBoundingSphere(new THREE.Sphere());
  const maxRatio = spot === "paper" ? 1.2 : spot === "bedframe" || spot === "table" ? 1.6 : 3;
  const radius = clamp(union.radius, product.radius * 1.3, product.radius * maxRatio);
  const t = union.radius > product.radius + 1e-6 ? clamp((radius - product.radius) / (union.radius - product.radius), 0, 1) : 0;
  const frameCenter = product.center.clone().lerp(union.center, t);
  const { azimuth, elevation } = env.view;
  const home = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));

  let dims: RoomPlacement["dims"] = null;
  const yaw = placement.yaw;
  if (spot === "floor") dims = { position: new THREE.Vector3(center.x, box.max.y + 0.002 * u, center.z), flat: true, yaw };
  else if (spot === "wall" || spot === "towel") dims = { position: new THREE.Vector3(pivot.x, pivot.y, box.max.z + 0.004 * u), flat: false, yaw: 0 };
  else if (spot === "paper" || spot === "window" || spot === "stand" || spot === "top") dims = { position: new THREE.Vector3(center.x, center.y, box.max.z + 0.004 * u), flat: false, yaw };

  return { unitsPerCm: upc, box, center: frameCenter, radius, home, dims };
}
