"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { dressFor } from "@/components/product/art-editor/mannequin";
import { DEFAULT_ART, hasArtContent, type ArtRender } from "../../art";
import { useApparelArt, useGeometriesCleanup } from "../fabric";
import { backArtOf, faceArtOf, useArtTexture, type ModelProps } from "../shared";
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
  sleeveArtGeometry,
  sleevePiece,
  sublimationSkins,
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
      // Revisão da Padrão de 25/10/2026: o feminino é blusa sem manga com viés; o masculino, camiseta de manga curta.
      return /\bfeminino\b/.test(spec.details ?? "")
        ? { sleeve: "none", neck: "scoop", knit: "jersey", edge: "binding", accentTrim: true, accentSleeves: false }
        : { sleeve: "short", neck: "crew", knit: "jersey", edge: "rib", accentTrim: true, accentSleeves: false };
    case "jersey":
      // Camisa de futebol "Sem Manga" (opção Modelo) vira regata com viés; sublimada inteira, a manga é estampada.
      if (spec.sleeveless) return { sleeve: "none", neck: "v", knit: "dryfit", edge: "binding", accentTrim: true, accentSleeves: false };
      return { sleeve: "short", neck: "v", knit: "dryfit", edge: "rib", accentTrim: true, accentSleeves: !spec.fullPrint };
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

/**
 * Estampa: formato do DTF limitado ao que cabe na frente; logo pequeno vai para o peito esquerdo. As costas usam a área
 * do verso quando a opção traz outra (Polo: 8 × 8 cm na frente, 30 × 20 cm nas costas, como no gabarito).
 */
function printRects(shape: GarmentShape, rawW: number, rawH: number, backCm: [number, number] | null | undefined) {
  const { cut } = shape;
  const fitted = (w0: number, h0: number) => {
    const aspect = Math.min(5, Math.max(0.2, w0 / h0));
    const maxW = cut.W * 0.78;
    const maxH = Math.max(8, cut.L - cut.dropFront - 18);
    const fit = Math.min(1, maxW / w0, maxH / (w0 / aspect));
    const w = w0 * fit;
    return { w, h: w / aspect, aspect };
  };
  const { w, h, aspect } = fitted(rawW, rawH);
  const k = Math.sqrt(cut.W / 54);
  const chestLogo = rawW <= 12 && rawH <= 12;
  const gap = (cut.neck === "polo" ? 9 : cut.neck === "v" ? 3.5 : cut.neck === "scoop" ? 4 : 6.5) * k;
  const front: PrintRect = chestLogo ? { s: 9.5 * k, y: -cut.dropFront - 7.5 * k - h / 2, w, h } : { s: 0, y: -cut.dropFront - gap - h / 2, w, h };
  const b = backCm ? fitted(backCm[0], backCm[1]) : { w, h, aspect };
  const back: PrintRect = { s: 0, y: -cut.dropBack - 8.5 * k - b.h / 2, w: b.w, h: b.h };
  return { front, back, aspect, backAspect: b.aspect };
}

type Cloth = (color: string, map: THREE.Texture, scale: number, extra?: Partial<THREE.MeshPhysicalMaterialParameters>) => ReactNode;

/** Estampa localizada (DTF, silk): pele da arte sobre o tecido, na frente e, com arte no verso, nas costas. */
function PatchPrints({ shape, spec, art, label, sleeves, knitMap }: { shape: GarmentShape; spec: ModelProps["spec"]; art: ModelProps["art"]; label: string; sleeves: boolean; knitMap: THREE.Texture }) {
  const printArt = useApparelArt(art);
  const rawW = spec.widthCm && spec.widthCm > 0 ? spec.widthCm : 21;
  const rawH = spec.heightCm && spec.heightCm > 0 ? spec.heightCm : 28;
  const rects = useMemo(() => printRects(shape, rawW, rawH, spec.backPrintCm), [shape, rawW, rawH, spec.backPrintCm]);
  const texture = useArtTexture(rects.aspect, "front", printArt, label);
  const backArt = art.back ?? null;
  const hasBack = hasArtContent(backArt);
  const backRender = useMemo<ArtRender>(
    () => ({ ...(backArt ?? DEFAULT_ART), back: null, ledColors: undefined, kind: art.kind, surface: art.surface, opaque: art.opaque, sample: false }),
    [backArt, art.kind, art.surface, art.opaque],
  );
  const backPrint = useApparelArt(backRender);
  const backTexture = useArtTexture(rects.backAspect, "front", backPrint, label);
  const prints = useMemo(() => {
    const front = printPatch(shape, rects.front, false);
    bakeTorsoAO(shape, front, sleeves);
    const back = hasBack ? printPatch(shape, rects.back, true) : null;
    if (back) bakeTorsoAO(shape, back, sleeves);
    return { front, back, list: back ? [front, back] : [front] };
  }, [shape, rects, hasBack, sleeves]);
  useGeometriesCleanup(prints.list);
  return (
    <>
      <mesh geometry={prints.front} renderOrder={1}>
        <meshPhysicalMaterial map={texture} transparent alphaTest={0.02} depthWrite={false} vertexColors roughness={0.55} normalMap={knitMap} normalScale={[0.2, 0.2]} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      {prints.back && (
        <mesh geometry={prints.back} renderOrder={1}>
          <meshPhysicalMaterial map={backTexture} transparent alphaTest={0.02} depthWrite={false} vertexColors roughness={0.55} normalMap={knitMap} normalScale={[0.2, 0.2]} polygonOffset polygonOffsetFactor={-4} />
        </mesh>
      )}
    </>
  );
}

/** Barra em dois tons (cor por vértice): a metade da frente (z ≥ 0) numa cor e a das costas em outra. */
function twoToneHem(hem: THREE.BufferGeometry, front: string, back: string) {
  const g = hem.clone();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const f = new THREE.Color(front);
  const b = new THREE.Color(back);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) (pos.getZ(i) >= 0 ? f : b).toArray(colors, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Tecido sublimado com a arte de uma superfície (a textura fica neste componente: só existe quando há arte). */
function PrintedSkin({ geometry, aspect, art, label, cloth, knitMap, alphaMap }: { geometry: THREE.BufferGeometry; aspect: number; art: ArtRender; label: string; cloth: Cloth; knitMap: THREE.Texture; alphaMap?: THREE.Texture }) {
  const map = useArtTexture(aspect, "front", art, label);
  return <mesh geometry={geometry}>{cloth("#ffffff", knitMap, 0.5, { map, ...(alphaMap ? { alphaMap, alphaTest: 0.5 } : {}) })}</mesh>;
}

/**
 * Corpo sublimado inteiro: a frente com a arte principal e as costas com a do verso (sem ela, o tecido na cor de fundo
 * da arte), as duas de ponta a ponta (sublimationSkins). As cavas continuam recortadas pela máscara (uv2).
 */
function SublimatedTorso({ torso, mask, art, label, fill, cloth, knitMap }: { torso: THREE.BufferGeometry; mask: THREE.Texture; art: ModelProps["art"]; label: string; fill: string; cloth: Cloth; knitMap: THREE.Texture }) {
  const skins = useMemo(() => sublimationSkins(torso), [torso]);
  const list = useMemo(() => [skins.front, skins.back], [skins]);
  useGeometriesCleanup(list);
  const skinMask = useMemo(() => {
    const t = mask.clone();
    t.channel = 2;
    return t;
  }, [mask]);
  useEffect(() => () => skinMask.dispose(), [skinMask]);
  const backArt = useMemo(() => backArtOf(art), [art]);
  return (
    <>
      <PrintedSkin geometry={skins.front} aspect={skins.frontAspect} art={art} label={label} cloth={cloth} knitMap={knitMap} alphaMap={skinMask} />
      {backArt ? (
        <PrintedSkin geometry={skins.back} aspect={skins.backAspect} art={backArt} label={label} cloth={cloth} knitMap={knitMap} alphaMap={skinMask} />
      ) : (
        <mesh geometry={skins.back}>{cloth(fill, knitMap, 0.55, { alphaMap: skinMask, alphaTest: 0.5 })}</mesh>
      )}
    </>
  );
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

  // Sublimação total: o tecido sai na cor de fundo da arte e a estampa cobre o corpo e as mangas.
  const full = Boolean(spec.fullPrint);
  // Manga sublimada: a arte de cada manga no molde dela; a do lado −x é desenhada espelhada (u invertido).
  const sleeveArt = useMemo(() => {
    if (!full || !parts.sleeve) return null;
    return { plus: sleeveArtGeometry(parts.sleeve, false), minus: sleeveArtGeometry(parts.sleeve, true) };
  }, [full, parts.sleeve]);
  const sleeveArtList = useMemo(() => (sleeveArt ? [sleeveArt.plus.geometry, sleeveArt.minus.geometry] : EMPTY), [sleeveArt]);
  useGeometriesCleanup(sleeveArtList);

  // Texturas: malha do tecido e canelado (em cache, compartilhadas) e a máscara das cavas (por peça).
  const knitMap = useMemo(() => knitNormalMap(style.knit), [style.knit]);
  const ribMap = useMemo(() => ribNormalMap(), []);
  const mask = useMemo(() => armholeMask(shape), [shape]);
  useEffect(() => () => mask.dispose(), [mask]);

  const base = full && /^#[0-9a-f]{3,8}$/i.test(art.background) ? art.background : spec.baseColor;
  const accent = spec.accentColor ?? (luminance(base) > 0.5 ? "#1d1d22" : "#f2f2f2");
  // Sublimada com viés/ribana escolhido no acabamento: gola e cavas na cor dele.
  const trimColor = style.accentTrim || (full && spec.accentColor) ? accent : base;
  const sleeveColor = style.accentSleeves && style.sleeve !== "none" ? accent : base;
  const lining = shade(base, 0.82);
  // Sublimada: a barra dobrada continua a estampa de cada lado (frente na cor de fundo da frente, costas na do verso).
  const backFill = full && art.back && hasArtContent(art.back) && /^#[0-9a-f]{3,8}$/i.test(art.back.background) ? art.back.background : base;
  const hemTones = useMemo(() => (full && backFill !== base ? twoToneHem(parts.hem, base, backFill) : null), [full, parts.hem, base, backFill]);
  const hemList = useMemo(() => (hemTones ? [hemTones] : EMPTY), [hemTones]);
  useGeometriesCleanup(hemList);
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

  // Lado +x (esquerdo de quem veste) e −x (direito, desenhado pelo grupo espelhado): na sublimada, cada manga com a
  // arte da superfície dela ("Manga esquerda"/"Manga direita" do gabarito) ou na cor do fundo.
  const sleeveMeshes = (side: 1 | -1) => {
    if (!parts.sleeve) return null;
    const skin = side === 1 ? sleeveArt?.plus : sleeveArt?.minus;
    const own = full ? faceArtOf(art, side === 1 ? "manga-esquerda" : "manga-direita") : null;
    // Avesso e barra da manga estampada: na cor de fundo da arte dela.
    const fill = own && /^#[0-9a-f]{3,8}$/i.test(own.background) ? own.background : sleeveColor;
    return (
      <>
        {own && skin ? (
          <PrintedSkin geometry={skin.geometry} aspect={skin.aspect} art={own} label={label} cloth={cloth} knitMap={knitMap} />
        ) : (
          <mesh geometry={parts.sleeve.geometry}>{cloth(sleeveColor, knitMap, 0.55)}</mesh>
        )}
        <mesh geometry={parts.sleeve.geometry}>
          <meshStandardMaterial color={shade(fill, 0.8)} roughness={1} side={THREE.BackSide} />
        </mesh>
        {parts.sleeveTrim && <mesh geometry={parts.sleeveTrim}>{cloth(ribbedCuff ? trimColor : fill, ribbedCuff ? ribMap : knitMap, ribbedCuff ? 0.9 : 0.5)}</mesh>}
      </>
    );
  };
  const sideMeshes = (side: 1 | -1) => (
    <>
      {sleeveMeshes(side)}
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
      {full ? (
        <SublimatedTorso torso={parts.torso} mask={mask} art={art} label={label} fill={base} cloth={cloth} knitMap={knitMap} />
      ) : (
        <mesh geometry={parts.torso}>{cloth(base, knitMap, 0.55, { alphaMap: mask, alphaTest: 0.5 })}</mesh>
      )}
      <mesh geometry={parts.torso}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} alphaMap={mask} alphaTest={0.5} />
      </mesh>
      {parts.neck && <mesh geometry={parts.neck}>{cloth(style.edge === "rib" ? (trimColor !== base ? trimColor : shade(base, 0.985)) : trimColor, style.edge === "rib" ? ribMap : knitMap, style.edge === "rib" ? 1 : 0.45)}</mesh>}
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
      {hemTones ? <mesh geometry={hemTones}>{cloth("#ffffff", knitMap, 0.5)}</mesh> : <mesh geometry={parts.hem}>{cloth(base, knitMap, 0.5)}</mesh>}
      <Stitches geometry={stitch} matrices={stitchLines.torso} color={thread} />

      {sideMeshes(1)}
      <group scale={[-1, 1, 1]}>{sideMeshes(-1)}</group>

      {!full && <PatchPrints shape={shape} spec={spec} art={art} label={label} sleeves={style.sleeve !== "none"} knitMap={knitMap} />}
    </TurnGroup>
  );
}
