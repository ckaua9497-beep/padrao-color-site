"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { dressFor } from "@/components/product/art-editor/mannequin";
import { DEFAULT_ART, hasArtContent, type ArtRender } from "../../art";
import { useApparelArt, useGeometriesCleanup } from "../fabric";
import { useArtTexture, type ModelProps } from "../shared";
import { armGeometry, bodyModel, standGeometry, torsoGeometry, type BodyModel } from "./body";
import { dressShape, garmentCut, torsoPiece, type GarmentShape, type NeckKind, type SleeveKind } from "./garment";
import {
  BINDING_PROFILE,
  HEM_PROFILE,
  armholeFrames,
  bakeSleeveAO,
  bakeTorsoAO,
  columnSeam,
  cuffProfile,
  flatColor,
  hemFrames,
  necklineCurve,
  printPatch,
  ribFrames,
  ribProfile,
  seamGeometry,
  sleeveHemFrames,
  sleevePiece,
  surfaceFrames,
  sweepPiece,
  type PrintRect,
  type SleevePiece,
} from "./pieces";
import { buttonGeometry, poloCollar, type PoloParts } from "./polo";
import { hemStitch, neckStitch, sleeveStitch, stitchGeometry, stitchMatrices } from "./stitches";
import { armholeMask, knitNormalMap, ribNormalMap, type Knit } from "./textures";
import { TurnGroup } from "./TurnGroup";

/** Unidades de cena por cm (a mesma escala da camiseta antiga: 72 cm ≈ 2,4). */
const UNIT = 2.4 / 72;
const EMPTY: THREE.BufferGeometry[] = [];

type TeeStyle = {
  sleeve: SleeveKind;
  neck: NeckKind;
  knit: Knit;
  edge: "rib" | "binding";
  /** Gola, punhos e viés na cor de destaque. */
  accentTrim: boolean;
  /** Mangas inteiras na cor de destaque (raglan da camisa de futebol). */
  accentSleeves: boolean;
};

/** Modelo da peça pelo subtipo e pelo tecido do nome do produto. */
function teeStyle(spec: ModelProps["spec"], label: string): TeeStyle {
  const name = label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const sporty = /\b(dry ?fit|helanca|polifil|poliester)\b/.test(name);
  const plain = { accentTrim: false, accentSleeves: false };
  if (spec.collar === "polo") return { sleeve: "short", neck: "polo", knit: "pique", edge: "rib", ...plain };
  switch (spec.variant) {
    case "pajama":
      return { sleeve: "long", neck: "crew", knit: "jersey", edge: "rib", accentTrim: true, accentSleeves: false };
    case "jersey":
      return { sleeve: "short", neck: "v", knit: "dryfit", edge: "rib", accentTrim: true, accentSleeves: true };
    case "vest":
      return { sleeve: "none", neck: "v", knit: "mesh", edge: "binding", accentTrim: true, accentSleeves: false };
    case "basketball":
      return { sleeve: "none", neck: "scoop", knit: "dryfit", edge: "binding", accentTrim: true, accentSleeves: false };
    case "abada":
      return { sleeve: "none", neck: "scoop", knit: "dryfit", edge: "binding", ...plain };
    default:
      return { sleeve: spec.sleeveless ? "none" : spec.longSleeve ? "long" : "short", neck: "crew", knit: sporty ? "dryfit" : "jersey", edge: "rib", ...plain };
  }
}

function luminance(color: string) {
  const c = new THREE.Color(color);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function shade(color: string, k: number) {
  return `#${new THREE.Color(color).multiplyScalar(k).getHexString()}`;
}

type Parts = {
  torso: THREE.BufferGeometry;
  sleeve: SleevePiece | null;
  sleeveTrim: THREE.BufferGeometry | null;
  armholeTrim: THREE.BufferGeometry | null;
  /** Gola canelada ou viés (camisetas); a polo usa `polo`. */
  neck: THREE.BufferGeometry | null;
  polo: PoloParts | null;
  hem: THREE.BufferGeometry;
  /** Costuras do lado +x (espelhadas no −x). */
  seams: THREE.BufferGeometry[];
  list: THREE.BufferGeometry[];
};

function buildParts(shape: GarmentShape, style: TeeStyle): Parts {
  const { cut } = shape;
  const torso = torsoPiece(shape);
  bakeTorsoAO(shape, torso.geometry, style.sleeve !== "none");
  let sleeve: SleevePiece | null = null;
  let sleeveTrim: THREE.BufferGeometry | null = null;
  let armholeTrim: THREE.BufferGeometry | null = null;
  const seams: THREE.BufferGeometry[] = [];
  const armholePts = shape.armhole.map(({ phi, y }) => shape.point(phi, y));
  const armholeNrm = shape.armhole.map(({ phi, y }) => shape.normal(phi, y));
  if (style.sleeve !== "none") {
    sleeve = sleevePiece(shape);
    bakeSleeveAO(shape, sleeve.geometry);
    // Manga longa e polo: punho canelado; camiseta: barra dobrada.
    const trimProfile = style.sleeve === "long" ? cuffProfile(5.5) : style.neck === "polo" ? cuffProfile(2.6) : HEM_PROFILE;
    sleeveTrim = flatColor(sweepPiece(sleeveHemFrames(sleeve), trimProfile, true).geometry);
    // Costura da cava (manga montada) e do ombro.
    seams.push(seamGeometry(armholePts, armholeNrm, 0.075, 0.06, true));
    const top = shape.neckline(shape.shoulderPoint.phi) - 0.15;
    const shoulder = columnSeam(shape, shape.shoulderPoint.phi, top, shape.shoulderPoint.y + 0.2);
    seams.push(seamGeometry(shoulder.points, shoulder.normals));
  } else {
    armholeTrim = flatColor(sweepPiece(armholeFrames(shape), BINDING_PROFILE, true).geometry);
  }
  const side = columnSeam(shape, shape.armpit.phi, shape.armpit.y - 0.3, shape.yHem + 2.3);
  seams.push(seamGeometry(side.points, side.normals, 0.06, 0.04));
  const curve = necklineCurve(shape);
  const polo = style.neck === "polo" ? poloCollar(shape) : null;
  if (polo) polo.list.forEach((g) => flatColor(g));
  const neck = polo
    ? null
    : style.edge === "rib" && cut.rib > 0
      ? sweepPiece(ribFrames(shape, curve, cut.rib), ribProfile(cut.rib), true).geometry
      : sweepPiece(
          surfaceFrames(shape, curve, true, (p) => new THREE.Vector3(-p.x, 0.5, -p.z)),
          BINDING_PROFILE,
          true,
        ).geometry;
  if (neck) flatColor(neck);
  const hem = flatColor(sweepPiece(hemFrames(shape), HEM_PROFILE, true).geometry);
  const list = [torso.geometry, hem, ...seams, ...(neck ? [neck] : []), ...(polo?.list ?? [])];
  if (sleeve) list.push(sleeve.geometry);
  if (sleeveTrim) list.push(sleeveTrim);
  if (armholeTrim) list.push(armholeTrim);
  return { torso: torso.geometry, sleeve, sleeveTrim, armholeTrim, neck, polo, hem, seams, list };
}

type MannequinParts = { torso: THREE.BufferGeometry; arm: THREE.BufferGeometry; pole: THREE.BufferGeometry; base: THREE.BufferGeometry; list: THREE.BufferGeometry[] };

function buildMannequin(body: BodyModel, armEnd: number): MannequinParts {
  const torso = torsoGeometry(body);
  const arm = armGeometry(body, armEnd);
  const { pole, base } = standGeometry(body);
  return { torso, arm, pole, base, list: [torso, arm, pole, base] };
}

/** Estampa: formato do DTF limitado ao que cabe na frente; logo pequeno vai para o peito esquerdo. */
function printRects(shape: GarmentShape, rawW: number, rawH: number) {
  const { cut } = shape;
  const aspect = Math.min(5, Math.max(0.2, rawW / rawH));
  const maxW = cut.W * 0.78;
  const maxH = Math.max(8, cut.L - cut.dropFront - 18);
  const fit = Math.min(1, maxW / rawW, maxH / (rawW / aspect));
  const w = rawW * fit;
  const h = w / aspect;
  const k = Math.sqrt(cut.W / 54);
  const chestLogo = rawW <= 12 && rawH <= 12;
  const gap = (cut.neck === "polo" ? 9 : cut.neck === "v" ? 3.5 : cut.neck === "scoop" ? 4 : 6.5) * k;
  const front: PrintRect = chestLogo ? { s: 9.5 * k, y: -cut.dropFront - 7.5 * k - h / 2, w, h } : { s: 0, y: -cut.dropFront - gap - h / 2, w, h };
  const back: PrintRect = { s: 0, y: -cut.dropBack - 8.5 * k - h / 2, w, h };
  return { front, back, aspect };
}

/** Pespontos: um cilindro curto instanciado ao longo das linhas (fora do enquadramento da câmera). */
function Stitches({ geometry, matrices, color }: { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return (
    <instancedMesh key={matrices.length} ref={ref} args={[geometry, undefined, matrices.length]} userData={{ noBounds: true }}>
      <meshStandardMaterial color={color} roughness={0.68} />
    </instancedMesh>
  );
}

/**
 * Camiseta vestida num busto de vitrine (ou sozinha, como num manequim invisível, com `art.mannequin`
 * = null): tecido com caimento e dobras, gola canelada, barras dobradas, costuras e a estampa como uma
 * pele sobre o tecido. Frente em +z; o lado −x é o espelho do +x.
 */
type TeeProps = ModelProps & {
  /** Pijama: blusa sem manequim (a calça dobrada vem em `extra`). */
  pajama?: boolean;
  /** Peças extras no mesmo espaço da camiseta (cm, y = 0 no ombro): barra e frente da peça. */
  extra?: (info: { yHem: number; front: number }) => ReactNode;
};

export function TeeModel({ spec, art, label, pajama = false, extra }: TeeProps) {
  const style = useMemo(() => teeStyle(spec, label), [spec, label]);
  const mannequin = pajama ? null : art.mannequin;
  const dressed = mannequin !== null;
  const size = mannequin?.size ?? "M";
  const bodyType = mannequin?.body ?? "medio";
  const widthCm = mannequin?.widthCm ?? null;
  const lengthCm = mannequin?.lengthCm ?? null;
  const dress = useMemo(() => dressFor(size, bodyType, widthCm, lengthCm), [size, bodyType, widthCm, lengthCm]);
  // Peça sem manga veste um busto sem braços; manga longa pede os braços mais junto do corpo.
  const body = useMemo(() => bodyModel(dress.body, { arms: style.sleeve !== "none", abduction: style.sleeve === "long" ? 16 : 21 }), [dress, style.sleeve]);
  const cut = useMemo(() => garmentCut({ W: dress.widthCm, L: dress.lengthCm, sleeve: style.sleeve, neck: style.neck, edge: style.edge }), [dress, style]);
  const shape = useMemo(() => dressShape(body, cut), [body, cut]);
  const parts = useMemo(() => buildParts(shape, style), [shape, style]);
  useGeometriesCleanup(parts.list);
  const armEnd = parts.sleeve ? (style.sleeve === "long" ? body.arm.wrist : parts.sleeve.hemS + 3.2 * body.hs) : 15 * body.hs;
  const figure = useMemo(() => (dressed ? buildMannequin(body, armEnd) : null), [dressed, body, armEnd]);
  useGeometriesCleanup(figure?.list ?? EMPTY);

  // Estampa (frente e, se houver arte, costas).
  const printArt = useApparelArt(art);
  const rawW = spec.widthCm && spec.widthCm > 0 ? spec.widthCm : 21;
  const rawH = spec.heightCm && spec.heightCm > 0 ? spec.heightCm : 28;
  const rects = useMemo(() => printRects(shape, rawW, rawH), [shape, rawW, rawH]);
  const texture = useArtTexture(rects.aspect, "front", printArt, label);
  const backArt = art.back ?? null;
  const hasBack = hasArtContent(backArt);
  const backRender = useMemo<ArtRender>(
    () => ({ ...(backArt ?? DEFAULT_ART), back: null, ledColors: undefined, kind: art.kind, surface: art.surface, opaque: art.opaque, sample: false }),
    [backArt, art.kind, art.surface, art.opaque],
  );
  const backPrint = useApparelArt(backRender);
  const backTexture = useArtTexture(rects.aspect, "front", backPrint, label);
  const prints = useMemo(() => {
    const front = printPatch(shape, rects.front, false);
    bakeTorsoAO(shape, front, style.sleeve !== "none");
    const back = hasBack ? printPatch(shape, rects.back, true) : null;
    if (back) bakeTorsoAO(shape, back, style.sleeve !== "none");
    return { front, back, list: back ? [front, back] : [front] };
  }, [shape, rects, hasBack, style.sleeve]);
  useGeometriesCleanup(prints.list);

  // Texturas: malha do tecido e canelado (em cache, compartilhadas) e a máscara das cavas (por peça).
  const knitMap = useMemo(() => knitNormalMap(style.knit), [style.knit]);
  const ribMap = useMemo(() => ribNormalMap(), []);
  const mask = useMemo(() => armholeMask(shape), [shape]);
  useEffect(() => () => mask.dispose(), [mask]);

  const base = spec.baseColor;
  const accent = spec.accentColor ?? (luminance(base) > 0.5 ? "#1d1d22" : "#f2f2f2");
  const trimColor = style.accentTrim ? accent : base;
  const sleeveColor = style.accentSleeves && style.sleeve !== "none" ? accent : base;
  const lining = shade(base, 0.82);
  const dark = luminance(base) < 0.35;
  const sporty = style.knit === "dryfit" || style.knit === "mesh";
  const fabric = { roughness: sporty ? 0.62 : 0.88, sheen: sporty ? 0.35 : 0.75, sheenRoughness: sporty ? 0.35 : 0.62 };
  const sheenColor = dark ? "#8a8a90" : "#ffffff";
  // Manequim: grafite sob peça clara, marfim sob peça escura.
  const skin = luminance(base) > 0.45 ? "#2e2e33" : "#ece8e1";

  const ribbedCuff = style.sleeve === "long" || style.neck === "polo";
  // Pesponto duplo na barra e na manga (camiseta), pesponto da gola canelada.
  const stitch = useMemo(() => stitchGeometry(), []);
  useEffect(() => () => stitch.dispose(), [stitch]);
  const stitchLines = useMemo(() => {
    const torso = [hemStitch(shape, 1.75), hemStitch(shape, 2.3)];
    if (parts.neck && style.edge === "rib") torso.push(neckStitch(shape, 0.5));
    const sleeve = parts.sleeve && !ribbedCuff ? [sleeveStitch(parts.sleeve, 1.75), sleeveStitch(parts.sleeve, 2.3)] : [];
    return { torso: stitchMatrices(torso), sleeve: stitchMatrices(sleeve) };
  }, [shape, parts, style.edge, ribbedCuff]);
  const thread = luminance(base) > 0.5 ? shade(base, 0.84) : `#${new THREE.Color(base).lerp(new THREE.Color("#ffffff"), 0.16).getHexString()}`;
  const button = useMemo(() => buttonGeometry(), []);
  useEffect(() => () => button.dispose(), [button]);
  const buttonColor = luminance(base) > 0.5 ? "#f3f1ec" : shade(base, 0.7);
  const Z = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  const cloth = (color: string, map: THREE.Texture, scale: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => (
    <meshPhysicalMaterial
      color={color}
      vertexColors
      roughness={fabric.roughness}
      sheen={fabric.sheen}
      sheenRoughness={fabric.sheenRoughness}
      sheenColor={sheenColor}
      normalMap={map}
      normalScale={[scale, scale]}
      {...extra}
    />
  );

  const sleeveMeshes = parts.sleeve ? (
    <>
      <mesh geometry={parts.sleeve.geometry}>{cloth(sleeveColor, knitMap, 0.55)}</mesh>
      <mesh geometry={parts.sleeve.geometry}>
        <meshStandardMaterial color={shade(sleeveColor, 0.8)} roughness={1} side={THREE.BackSide} />
      </mesh>
      {parts.sleeveTrim && (
        <mesh geometry={parts.sleeveTrim}>{cloth(ribbedCuff ? trimColor : sleeveColor, ribbedCuff ? ribMap : knitMap, ribbedCuff ? 0.9 : 0.5)}</mesh>
      )}
    </>
  ) : null;
  const sideMeshes = (
    <>
      {sleeveMeshes}
      {parts.armholeTrim && <mesh geometry={parts.armholeTrim}>{cloth(trimColor, knitMap, 0.4)}</mesh>}
      <Stitches geometry={stitch} matrices={stitchLines.sleeve} color={thread} />
      {parts.seams.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshPhysicalMaterial color={shade(i === 0 && parts.sleeve ? sleeveColor : base, 0.97)} roughness={0.9} sheen={fabric.sheen} sheenColor={sheenColor} />
        </mesh>
      ))}
    </>
  );

  return (
    <TurnGroup base={0.14} scale={UNIT}>
      {extra?.({ yHem: shape.yHem, front: shape.point(0, shape.yHem).z })}
      {/* Peça sem manequim: um apoio invisível embaixo deixa a camiseta "flutuando" sobre a sombra. */}
      {!figure && !extra && (
        <mesh position={[0, shape.yHem - 12, 0]}>
          <boxGeometry args={[1, 0.1, 1]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      )}

      {figure && (
        <group>
          <mesh geometry={figure.torso}>
            <meshPhysicalMaterial color={skin} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.4} />
          </mesh>
          {style.sleeve !== "none" && (
            <>
              <mesh geometry={figure.arm}>
                <meshPhysicalMaterial color={skin} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.4} />
              </mesh>
              <mesh geometry={figure.arm} scale={[-1, 1, 1]}>
                <meshPhysicalMaterial color={skin} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.4} />
              </mesh>
            </>
          )}
          <mesh geometry={figure.pole}>
            <meshStandardMaterial color="#c9cbd0" metalness={1} roughness={0.26} />
          </mesh>
          <mesh geometry={figure.base}>
            <meshPhysicalMaterial color={skin} roughness={0.5} clearcoat={0.25} />
          </mesh>
        </group>
      )}

      {/* Corpo da peça (frente, costas e o avesso pelas aberturas). */}
      <mesh geometry={parts.torso}>{cloth(base, knitMap, 0.55, { alphaMap: mask, alphaTest: 0.5 })}</mesh>
      <mesh geometry={parts.torso}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} alphaMap={mask} alphaTest={0.5} />
      </mesh>
      {parts.neck && <mesh geometry={parts.neck}>{cloth(style.edge === "rib" ? (style.accentTrim ? trimColor : shade(base, 0.985)) : trimColor, style.edge === "rib" ? ribMap : knitMap, style.edge === "rib" ? 1 : 0.45)}</mesh>}
      {parts.polo && (
        <group>
          <mesh geometry={parts.polo.stand}>{cloth(base, ribMap, 0.8)}</mesh>
          <mesh geometry={parts.polo.fall}>{cloth(base, knitMap, 0.5, { side: THREE.DoubleSide })}</mesh>
          <mesh geometry={parts.polo.fallEdge}>{cloth(base, knitMap, 0.3)}</mesh>
          <mesh geometry={parts.polo.placket}>{cloth(base, knitMap, 0.5)}</mesh>
          <mesh geometry={parts.polo.placketEdge}>{cloth(shade(base, 0.97), knitMap, 0.3)}</mesh>
          {parts.polo.buttons.map((b, i) => (
            <mesh key={i} geometry={button} position={b.position} quaternion={new THREE.Quaternion().setFromUnitVectors(Z, b.normal)}>
              <meshPhysicalMaterial color={buttonColor} roughness={0.25} clearcoat={0.6} clearcoatRoughness={0.2} />
            </mesh>
          ))}
        </group>
      )}
      <mesh geometry={parts.hem}>{cloth(base, knitMap, 0.5)}</mesh>
      <Stitches geometry={stitch} matrices={stitchLines.torso} color={thread} />

      {sideMeshes}
      <group scale={[-1, 1, 1]}>{sideMeshes}</group>

      <mesh geometry={prints.front} renderOrder={1}>
        <meshPhysicalMaterial map={texture} transparent alphaTest={0.02} depthWrite={false} vertexColors roughness={0.55} normalMap={knitMap} normalScale={[0.2, 0.2]} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      {prints.back && (
        <mesh geometry={prints.back} renderOrder={1}>
          <meshPhysicalMaterial map={backTexture} transparent alphaTest={0.02} depthWrite={false} vertexColors roughness={0.55} normalMap={knitMap} normalScale={[0.2, 0.2]} polygonOffset polygonOffsetFactor={-4} />
        </mesh>
      )}
    </TurnGroup>
  );
}
