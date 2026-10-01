"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { normalizeName, type MockupSpec } from "@/lib/mockup";
import { useAnimate } from "../viewer-hooks";
import { bandGeometry, metalColor, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { UNIT, radiusOnProfile, smoothProfile, type Pt } from "./vessel";

/*
 * Canecas e xícaras em escala real (UNIT = cm → cena, de vessel.tsx). A arte é uma faixa com a largura
 * física da área de impressão, centrada em θ = 0 (+z); a alça fica em θ = π, nunca sob a arte. Quando a
 * arte não cabe (alça, altura), ela encolhe por igual: a proporção nunca muda.
 */

const MUG_CM = { diameter: 8.2, height: 9.5 };
const TEACUP_CM = { top: 7.8, bottom: 4.6, height: 6.4 };
const SAUCER_CM = 13.6;
const CHOPP_CM = { diameter: 8.4, height: 14.8, base: 1.7 };

/**
 * Giro da peça na vista inicial. A alça fica oposta ao centro da arte (como na caneca real), então
 * a arte vem de frente: um leve giro para +x equilibra a vista inicial (+z) e a foto 3/4 do carrinho.
 */
const VIEW = 0.12;
/** Ângulo livre em volta da alça (rad). */
const HANDLE_GAP = 0.85;
/** Fração revelada da caneca mágica parada. */
const REVEAL_REST = 0.62;
/** Tamanho (cena) de um ladrilho da textura de glitter. */
const GLITTER_TILE = 0.6;

const SAUCER_R = (SAUCER_CM / 2) * UNIT;
const SAUCER_Y = SAUCER_R * 1.7;
// Perfil do pires em frações do raio: de baixo (pé) para fora, depois por cima de volta ao centro.
const SAUCER_UNDER: Pt[] = [[0, 0.028], [0.37, 0.028], [0.39, 0.004], [0.41, 0], [0.45, 0], [0.47, 0.012], [0.6, 0.04], [0.8, 0.075], [0.95, 0.105]];
const SAUCER_TOP: Pt[] = [[0.985, 0.1], [1, 0.115], [0.99, 0.13], [0.97, 0.135], [0.9, 0.12], [0.75, 0.095], [0.55, 0.07], [0.42, 0.06], [0.38, 0.052], [0.3, 0.05], [0, 0.05]];
/** Altura do fundo do pires onde a xícara apoia. */
const SAUCER_WELL = 0.05 * SAUCER_Y;

/* ------------------------------------------------------------------ geometria */

function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 8): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + (a1 - a0) * (i / steps);
    points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return points;
}

function dedupe(points: Pt[]): Pt[] {
  return points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-5);
}

function profileLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** Torno com v proporcional ao comprimento do perfil, para o glitter não esticar nas curvas. */
function latheArc(source: Pt[], segments = 128) {
  const points = dedupe(source);
  const geometry = new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)),
    segments,
  );
  const lengths = [0];
  for (let j = 1; j < points.length; j += 1) lengths.push(lengths[j - 1] + Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]));
  const total = lengths[lengths.length - 1] || 1;
  const uv = geometry.attributes.uv;
  for (let i = 0; i <= segments; i += 1) {
    for (let j = 0; j < points.length; j += 1) uv.setY(i * points.length + j, lengths[j] / total);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Corta o perfil na altura y (primeiro cruzamento subindo). */
function splitAt(points: Pt[], y: number): [Pt[], Pt[]] | null {
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (y0 < y && y <= y1) {
      const k = (y - y0) / (y1 - y0 || 1);
      const cut: Pt = [x0 + (x1 - x0) * k, y];
      return [[...points.slice(0, i), cut], [cut, ...points.slice(i)]];
    }
  }
  return null;
}

/** Arte do tamanho da área de impressão, reduzida por igual se não couber. */
function fitBand(widthCm: number, heightCm: number, maxWidth: number, maxHeight: number) {
  const w = Math.max(widthCm, 1) * UNIT;
  const h = Math.max(heightCm, 1) * UNIT;
  const scale = Math.max(0.05, Math.min(1, maxWidth / w, maxHeight / h));
  return { width: w * scale, height: h * scale };
}

function v3(x: number, y: number, z = 0) {
  return new THREE.Vector3(x, y, z);
}

/** Alça em D do lado +x, com seção oval (mais larga em z, como a alça de cerâmica de verdade). */
function classicHandle(r: number, bottom: number, top: number, reach: number, radius: number, widen: number) {
  const span = top - bottom;
  const mid = (top + bottom) / 2;
  const curve = new THREE.CatmullRomCurve3(
    [
      v3(r - 0.03, top),
      v3(r + reach * 0.42, top + span * 0.07),
      v3(r + reach * 0.88, top - span * 0.06),
      v3(r + reach, mid + span * 0.12),
      v3(r + reach * 0.95, bottom + span * 0.22),
      v3(r + reach * 0.62, bottom - span * 0.015),
      v3(r - 0.03, bottom),
    ],
    false,
    "centripetal",
  );
  const geometry = new THREE.TubeGeometry(curve, 112, radius, 18, false);
  geometry.scale(1, 1, widen);
  return geometry;
}

/**
 * Alça coração: coração deitado, lóbulos colados no corpo e a ponta para fora. A curva clássica tem
 * cúspides (no vão entre os lóbulos e na ponta) que torcem um tubo fechado; por isso são duas metades
 * abertas, fechadas por esferas nas cúspides, e dois calços achatados onde os lóbulos encostam no corpo.
 */
function heartHandle(r: number, mid: number, reach: number, height: number, radius: number, widen: number) {
  // Lóbulo encosta em r + 0,005: o tubo entra na parede externa sem furar a interna.
  const at = (t: number) => {
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return v3(r + 0.005 + (12 - hy) * (reach / 29), mid + hx * (height / 32));
  };
  const half = (t0: number) => {
    const points = Array.from({ length: 61 }, (_, i) => at(t0 + (i / 60) * Math.PI));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, "centripetal"), 96, radius, 16, false);
  };
  const joint = (point: THREE.Vector3) => new THREE.SphereGeometry(radius, 16, 12).translate(point.x, point.y, point.z);
  // Topo dos lóbulos (hy máximo ≈ 11,9 em t ≈ 0,9).
  const lobe = (sign: number) => {
    const p = at(sign * 0.9);
    return new THREE.SphereGeometry(1, 16, 12).scale(0.035, radius * 1.4, radius * 1.15).translate(r - 0.004, p.y, 0);
  };
  const pieces = [half(0), half(Math.PI), joint(at(0)), joint(at(Math.PI)), lobe(1), lobe(-1)];
  const geometry = mergeGeometries(pieces) ?? new THREE.BufferGeometry();
  pieces.forEach((piece) => piece.dispose());
  geometry.scale(1, 1, widen);
  return geometry;
}

function saucerProfile(): Pt[] {
  return [...SAUCER_UNDER, ...SAUCER_TOP].map(([x, y]) => [x * SAUCER_R, y * SAUCER_Y]);
}

/** Altura da face de baixo do pires a uma distância x do centro. */
function saucerUndersideAt(x: number): number {
  const points = SAUCER_UNDER.map(([px, py]): Pt => [px * SAUCER_R, py * SAUCER_Y]);
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x0 <= x && x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1));
  }
  return points[points.length - 1][1];
}

/* ------------------------------------------------------------------ texturas de dados */

/** Normal map de flocos (2×2 px cada), semente fixa: o glitter brilha igual em toda visita. */
function glitterNormalMap(repeatU: number, repeatV: number) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const angle = rand() * Math.PI * 2;
      const tilt = rand() ** 0.6 * 0.78;
      const nx = Math.cos(angle) * tilt;
      const ny = Math.sin(angle) * tilt;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const i = ((y + dy) * size + x + dx) * 4;
          data[i] = Math.round((nx * 0.5 + 0.5) * 255);
          data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
          data[i + 3] = 255;
        }
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(Math.max(1, repeatU), Math.max(1, repeatV));
  texture.needsUpdate = true;
  return texture;
}

/** Máscara da caneca mágica: revelado embaixo, preto em cima, borda macia e ondulada (calor subindo). */
function revealMask() {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / (w - 1);
      const v = y / (h - 1);
      const edge = 0.5 + 0.04 * Math.sin(u * Math.PI * 3 + 0.8) + 0.018 * Math.sin(u * Math.PI * 8.6);
      const a = 1 - THREE.MathUtils.smoothstep(v, edge - 0.1, edge + 0.1);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = Math.round(a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.offset.y = 0.5 - REVEAL_REST;
  texture.needsUpdate = true;
  return texture;
}

function steamMask() {
  const w = 32;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / (w - 1);
      const v = y / (h - 1);
      const a = Math.sin(Math.PI * u) ** 2 * Math.min(1, v / 0.22) * (1 - v) ** 1.4;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = Math.round(a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------------------------------------------ materiais */

// Sublimação em cromado/vidro não tem tinta branca: onde a arte é branca aparece o metal ou o vidro.
const KNOCKOUT_CHUNK = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float paperWhite = smoothstep( 0.8, 0.96, min( min( sampledDiffuseColor.r, sampledDiffuseColor.g ), sampledDiffuseColor.b ) );
  diffuseColor.rgb *= sampledDiffuseColor.rgb;
  diffuseColor.a *= sampledDiffuseColor.a * ( 1.0 - paperWhite );
#endif
`;

function knockoutWhite(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", KNOCKOUT_CHUNK);
}

const knockoutKey = () => "drinkware-knockout";

function Glaze({ color, side }: { color: string; side?: THREE.Side }) {
  return <meshPhysicalMaterial color={color} roughness={0.1} clearcoat={1} clearcoatRoughness={0.035} side={side ?? THREE.FrontSide} />;
}

function Chrome({ color }: { color: string }) {
  return <meshPhysicalMaterial color={color} metalness={1} roughness={0.07} clearcoat={0.4} clearcoatRoughness={0.05} />;
}

function Glitter({ color, map }: { color: string; map: THREE.Texture | null }) {
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={0.85}
      roughness={0.3}
      normalMap={map}
      normalScale={[0.9, 0.9]}
      clearcoat={1}
      clearcoatRoughness={0.03}
    />
  );
}

/** Tinta sublimada no esmalte: mesmo brilho da cerâmica. */
function InkGlaze({ map }: { map: THREE.Texture }) {
  return <meshPhysicalMaterial map={map} roughness={0.12} clearcoat={1} clearcoatRoughness={0.035} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />;
}

function GlassMaterial({ opacity, color = "#f3f7f8", roughness = 0.58 }: { opacity: number; color?: string; roughness?: number }) {
  return <meshPhysicalMaterial color={color} roughness={roughness} clearcoat={0.3} clearcoatRoughness={0.4} transparent opacity={opacity} depthWrite={false} />;
}

/* ------------------------------------------------------------------ vapor */

const STEAM_H = 0.9;

/** Três fitas de vapor ondulando; só existe enquanto o viewer anima (não entra no enquadramento). */
function Steam({ y, spread }: { y: number; spread: number }) {
  const animate = useAnimate();
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const clock = useRef(0);
  const ribbons = useMemo(
    () =>
      [0, 1, 2].map(() => {
        const geometry = new THREE.PlaneGeometry(0.22, STEAM_H, 1, 24);
        geometry.translate(0, STEAM_H / 2, 0);
        geometry.userData.base = Float32Array.from(geometry.attributes.position.array);
        return geometry;
      }),
    [],
  );
  const mask = useMemo(() => steamMask(), []);
  useEffect(() => () => ribbons.forEach((geometry) => geometry.dispose()), [ribbons]);
  useEffect(() => () => mask.dispose(), [mask]);

  useFrame((state, delta) => {
    if (!animate) return;
    clock.current += Math.min(delta, 0.1);
    const t = clock.current;
    // Laço simples (sem closures): nada é alocado por quadro.
    for (let index = 0; index < meshes.current.length; index += 1) {
      const mesh = meshes.current[index];
      if (!mesh) continue;
      const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const base = mesh.geometry.userData.base as Float32Array | undefined;
      if (!base) continue;
      for (let k = 0; k < position.count; k += 1) {
        const bx = base[k * 3];
        const by = base[k * 3 + 1];
        const rise = by / STEAM_H;
        position.setX(k, bx * (1 + rise * 0.9) + Math.sin(by * 7 - t * 1.7 + index * 2.1) * 0.08 * rise);
        position.setZ(k, Math.cos(by * 5 - t * 1.2 + index) * 0.05 * rise);
      }
      position.needsUpdate = true;
    }
    state.invalidate();
  });

  return (
    <group position-y={y} userData={{ noBounds: true }}>
      {ribbons.map((geometry, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            meshes.current[index] = mesh;
          }}
          geometry={geometry}
          position-x={(index - 1) * spread}
          rotation-y={index * 1.05}
        >
          <meshBasicMaterial color="#e6ecf0" alphaMap={mask} transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ caneca de cerâmica */

function mugSize(widthCm: number, heightCm: number) {
  // 20 × 8,5 cabe na caneca de 325 ml; 21,5 × 9,5 pede a de 375 ml (mais alta e larga).
  const diameter = THREE.MathUtils.clamp(Math.max(widthCm, 1) / (Math.PI * 0.8), MUG_CM.diameter, 9.6);
  const height = THREE.MathUtils.clamp(Math.max(heightCm, 1) + 1, MUG_CM.height, 12);
  return { r: (diameter / 2) * UNIT, h: height * UNIT };
}

type MugLook = { magic: boolean; chrome: boolean; glitter: boolean; glitterBase: boolean };

function lookOf(spec: MockupSpec): MugLook {
  const magic = spec.variant === "magic";
  // "branca com base dourada": só a faixa de baixo tem glitter (accentColor), o resto é cerâmica branca.
  const glitterBase = spec.glitter && spec.accentColor !== null && spec.metal === "none";
  return { magic, glitterBase, glitter: spec.glitter && !glitterBase, chrome: !spec.glitter && !magic && spec.metal !== "none" };
}

/** Colher de cerâmica: cabo extrudado chanfrado + concha em torno achatada. Origem na ponta do cabo. */
function Spoon({ length, color }: { length: number; color: string }) {
  const parts = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.022, length);
    shape.lineTo(-0.05, 0.14);
    shape.quadraticCurveTo(-0.058, 0, 0, 0);
    shape.quadraticCurveTo(0.058, 0, 0.05, 0.14);
    shape.lineTo(0.022, length);
    shape.lineTo(-0.022, length);
    const handle = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.007, bevelSegments: 3, curveSegments: 12 });
    handle.translate(0, 0, -0.006);
    const bowl = latheArc([[0, 0], [0.45, 0.04], [0.8, 0.14], [0.97, 0.27], [1, 0.32], [0.95, 0.335], [0.8, 0.2], [0.45, 0.1], [0, 0.07]], 48);
    bowl.rotateX(Math.PI / 2);
    bowl.scale(0.19, 0.27, 0.22);
    bowl.translate(0, length + 0.25, -0.055);
    return { handle, bowl };
  }, [length]);
  useGeometryCleanup(parts.handle);
  useGeometryCleanup(parts.bowl);
  return (
    <group>
      <mesh geometry={parts.handle}>
        <Glaze color={color} />
      </mesh>
      <mesh geometry={parts.bowl}>
        <Glaze color={color} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function CeramicMug({ spec, art, label }: ModelProps) {
  const aspect = Math.max(spec.widthCm, 1) / Math.max(spec.heightCm, 1);
  const texture = useArtTexture(aspect, "front", art, label);
  const animate = useAnimate();
  const look = lookOf(spec);
  const { magic, chrome, glitter, glitterBase } = look;
  const handleStyle = spec.variant === "heart-handle" ? "heart" : "classic";
  const spoon = spec.variant === "spoon";

  const parts = useMemo(() => {
    const { r, h } = mugSize(spec.widthCm, spec.heightCm);
    const t = 0.06;
    const floor = 0.1;
    const edge = 0.065;
    const lip = 0.018;
    // Pé sem esmalte, corpo com quina arredondada e lábio boleado; o interior começa no topo do lábio.
    const foot: Pt[] = [[0, 0.022], [r - 0.15, 0.022], [r - 0.12, 0.006], [r - 0.1, 0], [r - edge, 0]];
    const wall: Pt[] = [...arc(r - edge, edge, edge, -Math.PI / 2, 0, 10), [r, h - lip], ...arc(r - lip, h - lip, lip, 0, Math.PI / 2, 6)];
    const inner: Pt[] = [[r - lip, h], ...arc(r - t + lip, h - lip, lip, Math.PI / 2, Math.PI, 6), [r - t, floor + 0.12], ...arc(r - t - 0.12, floor + 0.12, 0.12, 0, -Math.PI / 2, 10), [0, floor]];
    const baseH = glitterBase ? 1.7 * UNIT : 0;
    const split = baseH ? splitAt(wall, baseH) : null;
    const lowerPts = split ? split[0] : null;
    const upperPts = split ? split[1] : wall;
    const bandLo = split ? baseH + 0.045 : 0.08;
    const bandHi = h - 0.05;
    const bandR = r + 0.0015;
    const fit = fitBand(spec.widthCm, spec.heightCm, bandR * (Math.PI * 2 - HANDLE_GAP), bandHi - bandLo);
    return {
      r,
      h,
      foot: latheArc(foot),
      lower: lowerPts ? latheArc(lowerPts) : null,
      upper: latheArc(upperPts),
      inner: latheArc(inner),
      band: bandGeometry({ radiusTop: bandR, radiusBottom: bandR, height: fit.height, width: fit.width, segments: 160, rows: 4 }),
      bandCenter: (bandLo + bandHi) / 2,
      glitterLength: profileLength(lowerPts ?? upperPts),
    };
  }, [spec.widthCm, spec.heightCm, glitterBase]);
  useGeometryCleanup(parts.foot);
  useGeometryCleanup(parts.lower);
  useGeometryCleanup(parts.upper);
  useGeometryCleanup(parts.inner);
  useGeometryCleanup(parts.band);

  const { r, h } = parts;
  const handleTop = h * 0.82;
  const handleBottom = h * 0.21;
  const reach = 0.4 * (h / 1.5);
  const handleRadius = 0.058;
  const widen = 1.5;
  const handle = useMemo(
    () =>
      handleStyle === "heart"
        ? heartHandle(r, h * 0.5, 0.56, 0.74, 0.046, 1.35)
        : classicHandle(r, handleBottom, handleTop, reach, handleRadius, widen),
    [handleStyle, r, h, handleBottom, handleTop, reach],
  );
  useGeometryCleanup(handle);
  const nub = useMemo(() => new THREE.SphereGeometry(1, 20, 14), []);
  useGeometryCleanup(nub);

  const glitterMaps = useMemo(() => {
    if (!spec.glitter) return null;
    const body = glitterNormalMap(Math.round((Math.PI * 2 * r) / GLITTER_TILE), parts.glitterLength / GLITTER_TILE);
    const grip = glitterNormalMap(3, 1);
    return { body, grip };
  }, [spec.glitter, r, parts.glitterLength]);
  useEffect(() => () => {
    glitterMaps?.body.dispose();
    glitterMaps?.grip.dispose();
  }, [glitterMaps]);

  const reveal = useMemo(() => (magic ? revealMask() : null), [magic]);
  useEffect(() => () => reveal?.dispose(), [reveal]);

  const inkTint = useMemo(() => (chrome ? `#${new THREE.Color(metalColor(spec.metal)).lerp(new THREE.Color("#ffffff"), 0.55).getHexString()}` : "#ffffff"), [chrome, spec.metal]);

  // Caneca mágica: o calor sobe e desce devagar, revelando e escondendo a arte.
  const bandMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const clock = useRef(0);
  // Oscila entre ~42% e a arte inteira (parte de REVEAL_REST): a arte nunca some de vez.
  useFrame((state, delta) => {
    if (!magic) return;
    const mask = bandMaterial.current?.alphaMap;
    if (!mask) return;
    if (!animate) {
      // Animação parada (fora da tela, reduced motion): o próximo quadro já sai na revelação de repouso.
      if (clock.current !== 0) {
        clock.current = 0;
        mask.offset.y = 0.5 - REVEAL_REST;
      }
      return;
    }
    clock.current += Math.min(delta, 0.1);
    const shown = 0.78 + 0.36 * Math.sin(clock.current * 0.45 - 0.46);
    mask.offset.y = 0.5 - THREE.MathUtils.clamp(shown, 0, 1.15);
    state.invalidate();
  });

  const bodyColor = chrome || (glitter && spec.metal !== "none") ? metalColor(spec.metal) : spec.baseColor;
  const innerColor = glitterBase ? spec.baseColor : spec.innerColor;
  // Alça colorida só nas canecas "alça e interior coloridos" / alça coração; a de colher tem alça branca.
  const accent = !spec.glitter && !chrome && !spoon && spec.accentColor ? spec.accentColor : null;
  const handleColor = accent ?? bodyColor;

  const bodyMaterial = chrome ? <Chrome color={bodyColor} /> : glitter ? <Glitter color={bodyColor} map={glitterMaps?.body ?? null} /> : <Glaze color={bodyColor} />;
  const handleMaterial = chrome ? <Chrome color={bodyColor} /> : glitter ? <Glitter color={bodyColor} map={glitterMaps?.grip ?? null} /> : <Glaze color={handleColor} />;

  let ink = <InkGlaze map={texture} />;
  if (magic) {
    ink = (
      <meshPhysicalMaterial
        ref={bandMaterial}
        map={texture}
        alphaMap={reveal}
        transparent
        depthWrite={false}
        roughness={0.12}
        clearcoat={1}
        clearcoatRoughness={0.035}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    );
  } else if (chrome) {
    ink = (
      <meshPhysicalMaterial
        map={texture}
        color={inkTint}
        metalness={0.5}
        roughness={0.18}
        clearcoat={1}
        clearcoatRoughness={0.04}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        onBeforeCompile={knockoutWhite}
        customProgramCacheKey={knockoutKey}
      />
    );
  }

  return (
    <group rotation-y={VIEW}>
      <mesh geometry={parts.foot}>
        <meshStandardMaterial color="#ebe5da" roughness={0.85} />
      </mesh>
      {parts.lower && (
        <mesh geometry={parts.lower}>
          <Glitter color={spec.accentColor ?? bodyColor} map={glitterMaps?.body ?? null} />
        </mesh>
      )}
      <mesh geometry={parts.upper}>{bodyMaterial}</mesh>
      <mesh geometry={parts.inner}>
        <Glaze color={innerColor} />
      </mesh>
      <mesh geometry={parts.band} position-y={parts.bandCenter} renderOrder={1}>
        {ink}
      </mesh>
      {/* Alça do lado oposto à arte (θ = π). */}
      <group rotation-y={Math.PI / 2}>
        <mesh geometry={handle}>{handleMaterial}</mesh>
        {handleStyle === "classic" &&
          [handleTop, handleBottom].map((y) => (
            <mesh key={y} geometry={nub} position={[r - 0.004, y, 0]} scale={[0.03, handleRadius * 1.3, handleRadius * widen * 1.2]}>
              {handleMaterial}
            </mesh>
          ))}
        {/* Colher encaixada na alça: largura de lado (como a fenda da alça), concha aberta para a caneca. */}
        {spoon && (
          <group position={[r + reach * 0.5, handleBottom - 0.02, 0]} rotation-z={-0.05}>
            <group rotation-y={-Math.PI / 2}>
              <Spoon length={handleTop - handleBottom + 0.22} color={spec.accentColor ?? spec.innerColor} />
            </group>
          </group>
        )}
      </group>
      {magic && animate && <Steam y={h + 0.04} spread={r * 0.35} />}
    </group>
  );
}

/* ------------------------------------------------------------------ chopp de vidro jateado */

function BeerMug({ spec, art, label }: ModelProps) {
  const aspect = Math.max(spec.widthCm, 1) / Math.max(spec.heightCm, 1);
  const texture = useArtTexture(aspect, "front", art, label);

  const parts = useMemo(() => {
    const diameter = THREE.MathUtils.clamp(Math.max(spec.widthCm, 1) / (Math.PI * 0.8), CHOPP_CM.diameter, 10);
    const R = (diameter / 2) * UNIT;
    const h = CHOPP_CM.height * UNIT;
    const baseH = CHOPP_CM.base * UNIT;
    const t = 0.065;
    const lip = 0.03;
    const outer: Pt[] = [[R, baseH - 0.01], [R, h - lip], ...arc(R - lip, h - lip, lip, 0, Math.PI / 2, 6)];
    const inner: Pt[] = [[R - lip, h], ...arc(R - t + lip, h - lip, lip, Math.PI / 2, Math.PI, 6), [R - t, baseH + 0.12], ...arc(R - t - 0.1, baseH + 0.12, 0.1, 0, -Math.PI / 2, 8), [0, baseH + 0.02]];
    // Fundo grosso facetado (12 lados), como o vidro prensado do chopp.
    const puckPts: Pt[] = [[0, 0.045], [R - 0.16, 0.012], [R - 0.08, 0], [R + 0.012, 0], [R + 0.03, 0.022], [R + 0.03, baseH - 0.045], [R + 0.008, baseH], [0, baseH]];
    const smoothPuck = latheArc(puckPts, 12);
    const puck = smoothPuck.toNonIndexed();
    smoothPuck.dispose();
    puck.computeVertexNormals();
    const bandLo = baseH + 0.22;
    const bandHi = h - 0.16;
    const bandR = R + 0.0015;
    const fit = fitBand(spec.widthCm, spec.heightCm, bandR * (Math.PI * 2 - HANDLE_GAP), bandHi - bandLo);
    return {
      R,
      h,
      baseH,
      outer: latheArc(outer),
      inner: latheArc(inner),
      puck,
      band: bandGeometry({ radiusTop: bandR, radiusBottom: bandR, height: fit.height, width: fit.width, segments: 160, rows: 4 }),
      bandCenter: (bandLo + bandHi) / 2,
      handle: classicHandle(R, baseH + 0.32, h * 0.8, 0.55, 0.075, 1.5),
      joints: [baseH + 0.32, h * 0.8],
    };
  }, [spec.widthCm, spec.heightCm]);
  useGeometryCleanup(parts.outer);
  useGeometryCleanup(parts.inner);
  useGeometryCleanup(parts.puck);
  useGeometryCleanup(parts.band);
  useGeometryCleanup(parts.handle);
  const nub = useMemo(() => new THREE.SphereGeometry(1, 20, 14), []);
  useGeometryCleanup(nub);

  // Ordem fixa das camadas transparentes: interior, fundo, alça, parede, arte.
  return (
    <group rotation-y={VIEW}>
      <mesh geometry={parts.inner} renderOrder={1}>
        <GlassMaterial opacity={0.28} />
      </mesh>
      <mesh geometry={parts.puck} renderOrder={2}>
        <GlassMaterial opacity={0.6} color="#e4efec" roughness={0.45} />
      </mesh>
      <group rotation-y={Math.PI / 2}>
        <mesh geometry={parts.handle} renderOrder={3}>
          <GlassMaterial opacity={0.55} color="#eef5f4" />
        </mesh>
        {/* Soldas da alça: fecham as pontas do tubo, que apareceriam através do vidro. */}
        {parts.joints.map((y) => (
          <mesh key={y} geometry={nub} position={[parts.R - 0.012, y, 0]} scale={[0.05, 0.075 * 1.6, 0.075 * 1.5 * 1.2]} renderOrder={3}>
            <GlassMaterial opacity={0.55} color="#eef5f4" />
          </mesh>
        ))}
      </group>
      <mesh geometry={parts.outer} renderOrder={4}>
        <GlassMaterial opacity={0.4} />
      </mesh>
      <mesh geometry={parts.band} position-y={parts.bandCenter} renderOrder={5}>
        <meshPhysicalMaterial
          map={texture}
          roughness={0.45}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
          onBeforeCompile={knockoutWhite}
          customProgramCacheKey={knockoutKey}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ xícara London */

function useTeacupParts(widthCm: number, heightCm: number) {
  const parts = useMemo(() => {
    const top = (TEACUP_CM.top / 2) * UNIT;
    const bottom = (TEACUP_CM.bottom / 2) * UNIT;
    const h = TEACUP_CM.height * UNIT;
    const wall = 0.032;
    const wallOuter = smoothProfile([
      [0, 0.014],
      [bottom * 0.9, 0],
      [bottom, 0.028],
      [bottom * 1.22, h * 0.3],
      [top * 0.95, h * 0.78],
      [top, h],
    ], 32);
    // Lábio boleado: meia-volta da parede externa para a interna.
    const outer: Pt[] = [...wallOuter, ...arc(top - wall / 2, h, wall / 2, 0, Math.PI, 8).slice(1)];
    const inner = smoothProfile([
      [top - wall, h],
      [top * 0.94 - wall, h * 0.78],
      [bottom * 1.18 - wall, h * 0.3],
      [bottom * 0.72, 0.08],
      [0, 0.075],
    ], 28);

    // A arte desce pela parede curva até onde ainda cabe sem passar por baixo da alça.
    const W = Math.max(widthCm, 1) * UNIT;
    const H = Math.max(heightCm, 1) * UNIT;
    const yTop = h * 0.93;
    const yFloor = h * 0.1;
    let scale = 1;
    while (scale > 0.3) {
      const y0 = yTop - H * scale;
      if (y0 >= yFloor && W * scale <= radiusOnProfile(wallOuter, y0) * (Math.PI * 2 - HANDLE_GAP)) break;
      scale -= 0.02;
    }
    const bandH = H * scale;
    const bandCenter = yTop - bandH / 2;

    const yHi = h * 0.84;
    const yLo = h * 0.36;
    const span = yHi - yLo;
    const rt = radiusOnProfile(wallOuter, yHi);
    const rb = radiusOnProfile(wallOuter, yLo);
    const reach = 0.28;
    const handle = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        [
          v3(rt - 0.012, yHi),
          v3(rt + reach * 0.5, yHi + 0.05),
          v3(rt + reach * 0.95, yHi - span * 0.1),
          v3(rb + reach * 1.05, yLo + span * 0.32),
          v3(rb + reach * 0.5, yLo - 0.035),
          v3(rb - 0.012, yLo),
        ],
        false,
        "centripetal",
      ),
      96,
      0.034,
      14,
      false,
    );
    handle.scale(1, 1, 1.35);

    return {
      height: h,
      outer: latheArc(outer, 96),
      inner: latheArc(inner, 96),
      handle,
      saucer: latheArc(saucerProfile(), 96),
      band: bandGeometry({
        radiusTop: top,
        radiusBottom: bottom,
        height: bandH,
        width: W * scale,
        segments: 128,
        rows: 16,
        radiusAt: (y) => radiusOnProfile(wallOuter, bandCenter + y) + 0.0018,
      }),
      bandCenter,
    };
  }, [widthCm, heightCm]);
  useGeometryCleanup(parts.outer);
  useGeometryCleanup(parts.inner);
  useGeometryCleanup(parts.handle);
  useGeometryCleanup(parts.saucer);
  useGeometryCleanup(parts.band);
  return parts;
}

type TeacupParts = ReturnType<typeof useTeacupParts>;

/** Xícara sobre o pires (origem no pé do pires). Só malhas: as geometrias vêm prontas e são reaproveitadas. */
function TeacupMeshes({ parts, texture, color, innerColor }: { parts: TeacupParts; texture: THREE.Texture; color: string; innerColor: string }) {
  return (
    <group>
      <mesh geometry={parts.saucer}>
        <Glaze color={color} />
      </mesh>
      <group position-y={SAUCER_WELL}>
        <mesh geometry={parts.outer}>
          <Glaze color={color} />
        </mesh>
        <mesh geometry={parts.inner}>
          <Glaze color={innerColor} />
        </mesh>
        <mesh geometry={parts.band} position-y={parts.bandCenter} renderOrder={1}>
          <InkGlaze map={texture} />
        </mesh>
        <mesh geometry={parts.handle} rotation-y={Math.PI / 2}>
          <Glaze color={color} />
        </mesh>
      </group>
    </group>
  );
}

function Teacup({ spec, art, label }: ModelProps) {
  const aspect = Math.max(spec.widthCm, 1) / Math.max(spec.heightCm, 1);
  const texture = useArtTexture(aspect, "front", art, label);
  const animate = useAnimate();
  const parts = useTeacupParts(spec.widthCm, spec.heightCm);
  return (
    <group rotation-y={VIEW}>
      <TeacupMeshes parts={parts} texture={texture} color={spec.baseColor} innerColor={spec.innerColor} />
      {animate && <Steam y={SAUCER_WELL + parts.height + 0.03} spread={0.12} />}
    </group>
  );
}

/* ------------------------------------------------------------------ kit com suporte */

const WIRE = 0.022;
/** Giro do suporte na vista inicial. */
const KIT_TURN = -0.25;
const RING_R = SAUCER_R * 0.62;

/** Quantas xícaras o kit traz: lido do nome ("Kit com 4 unidades"); 2 quando não diz. */
function kitCount(name: string): 2 | 4 {
  const match = /\bkit com (\d+)/.exec(normalizeName(name));
  return match && Number(match[1]) >= 4 ? 4 : 2;
}

/**
 * Suporte de arame cromado: duas colunas com pés em arco, arco de alça no topo com argola,
 * e em cada andar dois aros onde os pires apoiam (o pé do pires fica dentro do aro).
 */
function buildRack(count: 2 | 4) {
  const tiers = count === 4 ? 2 : 1;
  const cupX = SAUCER_R + 0.09;
  const postX = cupX + SAUCER_R + 0.1;
  const ringYs = Array.from({ length: tiers }, (_, i) => 0.3 + i * 1.3);
  const topY = ringYs[ringYs.length - 1] + 1.38;
  const crown = topY + 0.38;
  const tube = (curve: THREE.Curve<THREE.Vector3>, segments: number) => new THREE.TubeGeometry(curve, segments, WIRE, 10, false);

  const frame = tube(
    new THREE.CatmullRomCurve3(
      [
        v3(-postX, 0.1),
        v3(-postX, topY * 0.5),
        v3(-postX, topY - 0.25),
        v3(-postX * 0.93, topY + 0.06),
        v3(-postX * 0.6, topY + 0.3),
        v3(0, crown),
        v3(postX * 0.6, topY + 0.3),
        v3(postX * 0.93, topY + 0.06),
        v3(postX, topY - 0.25),
        v3(postX, topY * 0.5),
        v3(postX, 0.1),
      ],
      false,
      "centripetal",
    ),
    260,
  );
  const feet = [-postX, postX].map((x) => tube(new THREE.CatmullRomCurve3([v3(x, 0.04, -0.62), v3(x, 0.08, -0.3), v3(x, 0.1, 0), v3(x, 0.08, 0.3), v3(x, 0.04, 0.62)]), 48));
  const inner = cupX - RING_R;
  const outer = cupX + RING_R;
  const rails = ringYs.flatMap((y) =>
    [
      [-postX, -outer],
      [-inner, inner],
      [outer, postX],
    ].map(([a, b]) => tube(new THREE.LineCurve3(v3(a, y), v3(b, y)), 2)),
  );
  const seatY = WIRE - saucerUndersideAt(RING_R);
  return {
    wires: [frame, ...feet, ...rails],
    ring: new THREE.TorusGeometry(RING_R, WIRE, 10, 72),
    loop: new THREE.TorusGeometry(0.13, WIRE, 10, 40),
    ball: new THREE.SphereGeometry(0.042, 16, 12),
    rings: ringYs.flatMap((y) => [-cupX, cupX].map((x): [number, number] => [x, y])),
    seats: ringYs.flatMap((y) => [-cupX, cupX].map((x): [number, number] => [x, y + seatY])),
    balls: [-postX, postX].flatMap((x) => [-0.62, 0.62].map((z): [number, number, number] => [x, 0.042, z])),
    loopY: crown + 0.13 - WIRE,
  };
}

function TeacupKit({ spec, art, label }: ModelProps) {
  const aspect = Math.max(spec.widthCm, 1) / Math.max(spec.heightCm, 1);
  const texture = useArtTexture(aspect, "front", art, label);
  const parts = useTeacupParts(spec.widthCm, spec.heightCm);
  const count = kitCount(label);
  const rack = useMemo(() => buildRack(count), [count]);
  useEffect(
    () => () => {
      rack.wires.forEach((geometry) => geometry.dispose());
      rack.ring.dispose();
      rack.loop.dispose();
      rack.ball.dispose();
    },
    [rack],
  );
  const metal = <meshStandardMaterial color="#d7dbe0" metalness={1} roughness={0.22} />;
  // O suporte fica em 3/4; cada xícara gira de volta para a arte vir de frente (mesma vista da xícara solta).
  return (
    <group rotation-y={KIT_TURN}>
      {rack.wires.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          {metal}
        </mesh>
      ))}
      {rack.rings.map(([x, y]) => (
        <mesh key={`${x}:${y}`} geometry={rack.ring} position={[x, y, 0]} rotation-x={-Math.PI / 2}>
          {metal}
        </mesh>
      ))}
      {rack.balls.map(([x, y, z]) => (
        <mesh key={`${x}:${z}`} geometry={rack.ball} position={[x, y, z]}>
          {metal}
        </mesh>
      ))}
      <mesh geometry={rack.loop} position-y={rack.loopY}>
        {metal}
      </mesh>
      {rack.seats.map(([x, y]) => (
        <group key={`${x}:${y}`} position={[x, y, 0]} rotation-y={VIEW - KIT_TURN}>
          <TeacupMeshes parts={parts} texture={texture} color={spec.baseColor} innerColor={spec.innerColor} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ entrada */

/**
 * Caneca, xícara e chopp em escala real, de perfis em torno (lathe) com quinas boleadas. A arte é uma
 * faixa de sublimação centrada à frente, nunca sob a alça e sem distorção. Variantes: cerâmica esmaltada
 * (interior e alça coloridos), alça coração, colher de cerâmica encaixada na alça, mágica (revelação
 * parcial com borda macia, animada pelo calor), glitter (normal map de flocos) e base glitter, cromada
 * (a tinta deixa o metal aparecer onde a arte é branca), chopp de vidro jateado com fundo facetado,
 * xícara London com pires e kit de 2 ou 4 xícaras num suporte de arame cromado.
 */
export function MugModel({ spec, art, label, showDims }: ModelProps) {
  const props = { spec, art, label, showDims };
  if (spec.teacup) return spec.variant === "kit" ? <TeacupKit {...props} /> : <Teacup {...props} />;
  if (spec.glass) return <BeerMug {...props} />;
  return <CeramicMug {...props} />;
}
