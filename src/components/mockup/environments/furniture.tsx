"use client";

// Móveis procedurais em escala real (metros), em silhuetas limpas: sofá, poltrona, cama, criado-mudo,
// escrivaninha, cadeira, estante, balcão, banco, aparador, mesa de jantar, cozinha, gabinete de
// banheiro, plantas e luminárias. Cada peça tem a origem no chão (no meio das costas, quando encosta
// na parede) e sombra de contato assada embaixo. Sem sombra em tempo real.

import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { throwPillowGeometry } from "../models/homegoods";
import { useGeometryCleanup } from "../models/shared";
import {
  ARMCHAIR,
  BED,
  BENCH,
  BOOKCASE,
  COUNTER,
  DESK,
  DINING,
  KITCHEN_RUN,
  NIGHTSTAND,
  SIDEBOARD,
  SIDE_TABLE,
  SOFA,
  VANITY,
} from "./layout";
import { lathe, softBlock } from "./geometry";
import { rng, SOFT_SPREAD, type RoomTextures } from "./textures";

type V3 = [number, number, number];

export const TexturesContext = createContext<RoomTextures | null>(null);

function useTextures(): RoomTextures {
  const textures = useContext(TexturesContext);
  if (!textures) throw new Error("Móvel fora da sala");
  return textures;
}

/** Noite (neon): abajures acesos de verdade. */
export const NightContext = createContext(false);

/* ------------------------------------------------------------------------------- materiais */

export function FabricMaterial({ color }: { color: string }) {
  const { weave } = useTextures();
  return <meshStandardMaterial color={color} roughness={0.96} bumpMap={weave} bumpScale={0.9} />;
}

export function WoodMaterial({ tint = "#ffffff", roughness = 0.58 }: { tint?: string; roughness?: number }) {
  const { grain } = useTextures();
  return <meshStandardMaterial map={grain} color={tint} roughness={roughness} />;
}

export function MetalMaterial({ color = "#232427", roughness = 0.38 }: { color?: string; roughness?: number }) {
  return <meshStandardMaterial color={color} metalness={0.75} roughness={roughness} />;
}

function Matte({ color, roughness = 0.8 }: { color: string; roughness?: number }) {
  return <meshStandardMaterial color={color} roughness={roughness} />;
}

/** Cúpula de abajur: tecido claro que acende por dentro (mais forte à noite). */
function ShadeMaterial() {
  const night = useContext(NightContext);
  return <meshStandardMaterial color="#f3ece0" emissive="#ffcf8f" emissiveIntensity={night ? 1.25 : 0.22} roughness={0.9} side={THREE.DoubleSide} />;
}

/* ------------------------------------------------------------------------------- primitivas */

type BlockProps = { size: V3; radius?: number; bevel?: number; position?: V3; rotation?: V3; children: ReactNode };

/** Bloco boleado (estofado, tampo, gaveta). */
export function Block({ size, radius = 0.02, bevel = 0.01, position, rotation, children }: BlockProps) {
  const [w, h, d] = size;
  const geometry = useMemo(() => softBlock(w, h, d, radius, bevel), [w, h, d, radius, bevel]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      {children}
    </mesh>
  );
}

/** Sombra de contato assada (mancha escura no chão ou no tampo). */
export function ContactShadow({ size, position, opacity = 0.5, round = false }: { size: [number, number]; position: V3; opacity?: number; round?: boolean }) {
  const { blob, softRect } = useTextures();
  const spread = round ? 1 : SOFT_SPREAD;
  return (
    <mesh position={position} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[size[0] * spread, size[1] * spread]} />
      <meshBasicMaterial color="#000000" alphaMap={round ? blob : softRect} transparent opacity={opacity} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** Perna cônica (madeira ou metal) com base no chão. */
function Leg({ height, top, bottom, position, children }: { height: number; top: number; bottom: number; position: V3; children: ReactNode }) {
  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]}>
      <cylinderGeometry args={[top, bottom, height, 10]} />
      {children}
    </mesh>
  );
}

/* ------------------------------------------------------------------------------- sala */

/** Sofá de três lugares: base, braços, encosto, três almofadas de assento e três de encosto. */
export function Sofa({ color }: { color: string }) {
  const W = SOFA.width;
  const D = SOFA.depth;
  const legs = SOFA.legs;
  const baseH = 0.2;
  const seatH = SOFA.seat - legs - baseH;
  const arm = SOFA.armWidth;
  const inner = W - 2 * arm;
  const cw = inner / 3;
  const backD = 0.2;
  const seatColor = new THREE.Color(color).multiplyScalar(1.03).getStyle();
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.55} />
      <Block size={[W - 0.02, baseH, D - 0.02]} radius={0.04} bevel={0.025} position={[0, legs + baseH / 2, D / 2]}>
        <FabricMaterial color={color} />
      </Block>
      {[-1, 1].map((side) => (
        <Block key={side} size={[arm, SOFA.arm - legs, D]} radius={0.07} bevel={0.05} position={[side * (W / 2 - arm / 2), legs + (SOFA.arm - legs) / 2, D / 2]}>
          <FabricMaterial color={color} />
        </Block>
      ))}
      <Block size={[W - 0.04, SOFA.back - legs, backD]} radius={0.06} bevel={0.05} position={[0, legs + (SOFA.back - legs) / 2, backD / 2]}>
        <FabricMaterial color={color} />
      </Block>
      {[0, 1, 2].map((i) => (
        <group key={i} position-x={-inner / 2 + cw * (i + 0.5)}>
          <Block size={[cw - 0.012, seatH + 0.03, D - backD - 0.03]} radius={0.06} bevel={0.045} position={[0, legs + baseH + seatH / 2, backD + (D - backD) / 2]}>
            <FabricMaterial color={seatColor} />
          </Block>
          <Block size={[cw - 0.02, 0.46, 0.2]} radius={0.08} bevel={0.07} position={[0, SOFA.seat + 0.22, backD + 0.09]} rotation={[-0.12, 0, 0]}>
            <FabricMaterial color={seatColor} />
          </Block>
        </group>
      ))}
      {[
        [-W / 2 + 0.07, 0.07],
        [W / 2 - 0.07, 0.07],
        [-W / 2 + 0.07, D - 0.07],
        [W / 2 - 0.07, D - 0.07],
      ].map(([x, z]) => (
        <Leg key={`${x}:${z}`} height={legs} top={0.022} bottom={0.014} position={[x, 0, z]}>
          <WoodMaterial tint="#8a6a4c" />
        </Leg>
      ))}
    </group>
  );
}

/** Almofada decorativa lisa encostada no sofá ou na cama (mesmo corpo das almofadas do catálogo). */
export function ThrowPillow({ color, position, rotation, size = 0.45 }: { color: string; position: V3; rotation?: V3; size?: number }) {
  const geometry = useMemo(() => throwPillowGeometry(size * 100, size * 100), [size]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <FabricMaterial color={color} />
    </mesh>
  );
}

/** Poltrona de um lugar (mesma linha do sofá), girada para a sala. */
export function Armchair({ color }: { color: string }) {
  const W = ARMCHAIR.width;
  const D = ARMCHAIR.depth;
  const legs = SOFA.legs;
  const arm = 0.15;
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.5} />
      <Block size={[W - 0.02, 0.2, D - 0.02]} radius={0.04} bevel={0.025} position={[0, legs + 0.1, D / 2]}>
        <FabricMaterial color={color} />
      </Block>
      {[-1, 1].map((side) => (
        <Block key={side} size={[arm, SOFA.arm - legs, D]} radius={0.07} bevel={0.05} position={[side * (W / 2 - arm / 2), legs + (SOFA.arm - legs) / 2, D / 2]}>
          <FabricMaterial color={color} />
        </Block>
      ))}
      <Block size={[W - 0.04, SOFA.back - legs, 0.2]} radius={0.06} bevel={0.05} position={[0, legs + (SOFA.back - legs) / 2, 0.1]}>
        <FabricMaterial color={color} />
      </Block>
      <Block size={[W - 2 * arm - 0.01, 0.17, D - 0.23]} radius={0.06} bevel={0.045} position={[0, SOFA.seat - 0.08, 0.2 + (D - 0.2) / 2]}>
        <FabricMaterial color={color} />
      </Block>
      {[
        [-W / 2 + 0.06, 0.06],
        [W / 2 - 0.06, 0.06],
        [-W / 2 + 0.06, D - 0.06],
        [W / 2 - 0.06, D - 0.06],
      ].map(([x, z]) => (
        <Leg key={`${x}:${z}`} height={legs} top={0.022} bottom={0.014} position={[x, 0, z]}>
          <WoodMaterial tint="#8a6a4c" />
        </Leg>
      ))}
    </group>
  );
}

/** Mesinha lateral redonda: tampo de madeira e pé central de metal. */
export function SideTable() {
  const r = SIDE_TABLE.radius;
  const h = SIDE_TABLE.height;
  return (
    <group>
      <ContactShadow size={[r * 2.2, r * 2.2]} position={[0, 0.002, 0]} opacity={0.4} round />
      <mesh position-y={h - 0.0125}>
        <cylinderGeometry args={[r, r, 0.025, 40]} />
        <WoodMaterial />
      </mesh>
      <mesh position-y={(h - 0.025) / 2}>
        <cylinderGeometry args={[0.018, 0.018, h - 0.025, 12]} />
        <MetalMaterial />
      </mesh>
      <mesh position-y={0.008}>
        <cylinderGeometry args={[0.15, 0.16, 0.016, 32]} />
        <MetalMaterial />
      </mesh>
    </group>
  );
}

const LAMP_BASE: [number, number][] = [
  [0, 0],
  [0.07, 0],
  [0.085, 0.03],
  [0.095, 0.12],
  [0.07, 0.22],
  [0.025, 0.27],
  [0.015, 0.32],
  [0, 0.32],
];

/** Abajur de mesa: base de cerâmica e cúpula de tecido acesa. */
export function TableLamp({ color = "#d9cbb7" }: { color?: string }) {
  const base = useMemo(() => lathe(LAMP_BASE, 28), []);
  useGeometryCleanup(base);
  return (
    <group>
      <mesh geometry={base}>
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position-y={0.42}>
        <cylinderGeometry args={[0.12, 0.165, 0.2, 32, 1, true]} />
        <ShadeMaterial />
      </mesh>
    </group>
  );
}

/** Luminária de chão: base redonda, haste fina e cúpula. */
export function FloorLamp() {
  return (
    <group>
      <ContactShadow size={[0.36, 0.36]} position={[0, 0.002, 0]} opacity={0.4} round />
      <mesh position-y={0.01}>
        <cylinderGeometry args={[0.15, 0.16, 0.02, 32]} />
        <MetalMaterial />
      </mesh>
      <mesh position-y={0.75}>
        <cylinderGeometry args={[0.011, 0.011, 1.48, 10]} />
        <MetalMaterial />
      </mesh>
      <mesh position-y={1.52}>
        <cylinderGeometry args={[0.17, 0.22, 0.28, 32, 1, true]} />
        <ShadeMaterial />
      </mesh>
    </group>
  );
}

const POT: [number, number][] = [
  [0, 0],
  [0.13, 0],
  [0.145, 0.02],
  [0.18, 0.3],
  [0.19, 0.33],
  [0.17, 0.33],
  [0.165, 0.31],
  [0, 0.31],
];

/** Folhas em um só desenho (InstancedMesh com cor por folha). */
function Leaves({ count, height, spread, seed, size }: { count: number; height: number; spread: number; seed: number; size: number }) {
  const { leaf } = useTextures();
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  useGeometryCleanup(geometry);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const random = rng(seed);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      const angle = i * 2.4 + random() * 0.5;
      const radius = spread * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.1)));
      const y = height * (0.32 + 0.68 * t) + (random() - 0.5) * 0.06;
      position.set(Math.cos(angle) * radius * 0.6, y, Math.sin(angle) * radius * 0.6);
      // Folha saindo para fora do caule (giro em y para a direção da folha, inclinação em x).
      euler.set(0.6 + random() * 0.5, Math.PI / 2 - angle, (random() - 0.5) * 0.4, "YXZ");
      quaternion.setFromEuler(euler);
      const s = size * (0.7 + random() * 0.5) * (1 - t * 0.3);
      scale.set(s * 0.62, s, 1);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
      color.setHSL(0.27 + random() * 0.05, 0.35 + random() * 0.2, 0.62 + random() * 0.2);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, height, spread, seed, size, geometry]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]}>
      <meshStandardMaterial map={leaf} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.7} />
    </instancedMesh>
  );
}

/** Planta de vaso (figueira-lira): vaso de cerâmica, caules e folhas largas. */
export function Plant({ height, potColor = "#e9e3d9", seed = 7 }: { height: number; potColor?: string; seed?: number }) {
  const pot = useMemo(() => lathe(POT, 28), []);
  useGeometryCleanup(pot);
  const potScale = THREE.MathUtils.clamp(height / 1.5, 0.55, 1.15);
  const leaves = Math.round(18 + height * 12);
  return (
    <group>
      <ContactShadow size={[0.5 * potScale, 0.5 * potScale]} position={[0, 0.002, 0]} opacity={0.45} round />
      <group scale={potScale}>
        <mesh geometry={pot}>
          <meshStandardMaterial color={potColor} roughness={0.75} />
        </mesh>
        <mesh position-y={0.3}>
          <cylinderGeometry args={[0.16, 0.16, 0.01, 24]} />
          <Matte color="#3b2c20" roughness={1} />
        </mesh>
      </group>
      {[-0.03, 0.04, 0].map((x, i) => (
        <mesh key={i} position={[x, 0.3 * potScale + (height * 0.75) / 2, (i - 1) * 0.03]} rotation-z={x * 1.5}>
          <cylinderGeometry args={[0.008, 0.012, height * 0.75, 6]} />
          <Matte color="#5d4a35" />
        </mesh>
      ))}
      <Leaves count={leaves} height={height} spread={0.42 * Math.max(0.6, height / 1.5)} seed={seed} size={0.24 * Math.max(0.65, height / 1.5)} />
    </group>
  );
}

/** Quadro decorativo neutro com moldura de madeira, paspatur e a sombra macia na parede. */
export function WallArt({ w, h }: { w: number; h: number }) {
  const { art, softRect } = useTextures();
  const frame = 0.03;
  return (
    <group>
      <mesh position={[0.012, -0.03, 0.002]}>
        <planeGeometry args={[w * SOFT_SPREAD * 1.02, h * SOFT_SPREAD * 1.02]} />
        <meshBasicMaterial color="#000000" alphaMap={softRect} transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </mesh>
      <Block size={[w, h, 0.035]} radius={0.004} bevel={0.003} position={[0, 0, 0.0175]}>
        <WoodMaterial tint="#d9c3a5" roughness={0.55} />
      </Block>
      <mesh position-z={0.036}>
        <planeGeometry args={[w - frame * 2, h - frame * 2]} />
        <Matte color="#f6f3ee" roughness={0.9} />
      </mesh>
      <mesh position-z={0.037}>
        <planeGeometry args={[w * 0.62, h * 0.62]} />
        <meshStandardMaterial map={art} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Tapete decorativo neutro (pelo baixo), deitado no chão. */
export function DecorRug({ w, d }: { w: number; d: number }) {
  const { rug } = useTextures();
  return (
    <group>
      <mesh position-y={0.006} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      <mesh position-y={0.003}>
        <boxGeometry args={[w, 0.006, d]} />
        <Matte color="#cfc5b6" roughness={1} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------------------- quarto */

/** Cama de casal: base estofada, colchão, edredom dobrado, dois travesseiros e cabeceira em gomos. */
export function Bed({ fabric, duvet, accent, hidePillows = false }: { fabric: string; duvet: string; accent: string; hidePillows?: boolean }) {
  const W = BED.width;
  const L = BED.length;
  const hd = BED.headboardDepth;
  const channels = 6;
  const cw = (W + 0.2) / channels;
  const mattressTop = 0.55;
  return (
    <group>
      <ContactShadow size={[W + 0.2, L + 0.1]} position={[0, 0.002, hd + L / 2]} opacity={0.5} />
      <Block size={[W + 0.2, 0.5, hd]} radius={0.03} bevel={0.02} position={[0, 0.25, hd / 2]}>
        <FabricMaterial color={fabric} />
      </Block>
      {Array.from({ length: channels }, (_, i) => (
        <Block key={i} size={[cw - 0.008, BED.headboard - 0.48, 0.1]} radius={0.04} bevel={0.035} position={[-(W + 0.2) / 2 + cw * (i + 0.5), 0.48 + (BED.headboard - 0.48) / 2, hd / 2 + 0.02]}>
          <FabricMaterial color={fabric} />
        </Block>
      ))}
      <Block size={[W + 0.06, 0.3, L]} radius={0.03} bevel={0.02} position={[0, 0.15, hd + L / 2]}>
        <FabricMaterial color={fabric} />
      </Block>
      <Block size={[W, 0.25, L - 0.03]} radius={0.06} bevel={0.05} position={[0, 0.3 + 0.125, hd + (L - 0.03) / 2]}>
        <Matte color="#f4f2ee" roughness={0.95} />
      </Block>
      {/* Edredom cobrindo dois terços da cama, com a dobra para trás. */}
      <Block size={[W + 0.1, 0.16, L * 0.66]} radius={0.06} bevel={0.05} position={[0, BED.top - 0.08, hd + L * 0.34 + (L * 0.66) / 2]}>
        <FabricMaterial color={duvet} />
      </Block>
      <Block size={[W + 0.1, 0.07, 0.3]} radius={0.04} bevel={0.03} position={[0, BED.top + 0.02, hd + L * 0.34 + 0.12]}>
        <FabricMaterial color={duvet} />
      </Block>
      {/* Manta na peseira. */}
      <Block size={[W + 0.12, 0.05, 0.42]} radius={0.04} bevel={0.02} position={[0, BED.top + 0.012, hd + L - 0.3]}>
        <FabricMaterial color={accent} />
      </Block>
      {!hidePillows &&
        [-1, 1].map((side) => (
          <Block key={side} size={[0.66, 0.42, 0.14]} radius={0.12} bevel={0.06} position={[side * 0.38, mattressTop + 0.2, hd + 0.13]} rotation={[-0.32, 0, 0]}>
            <Matte color="#f7f6f2" roughness={0.95} />
          </Block>
        ))}
    </group>
  );
}

/** Criado-mudo de madeira com gaveta e pés finos. */
export function Nightstand() {
  const { width: w, depth: d, height: h } = NIGHTSTAND;
  const legs = 0.14;
  return (
    <group>
      <ContactShadow size={[w, d]} position={[0, 0.002, d / 2]} opacity={0.4} />
      <Block size={[w, h - legs, d]} radius={0.015} bevel={0.008} position={[0, legs + (h - legs) / 2, d / 2]}>
        <WoodMaterial />
      </Block>
      <mesh position={[0, legs + (h - legs) * 0.55, d + 0.001]}>
        <boxGeometry args={[w - 0.04, 0.006, 0.002]} />
        <Matte color="#4a3626" />
      </mesh>
      {[
        [-w / 2 + 0.04, 0.04],
        [w / 2 - 0.04, 0.04],
        [-w / 2 + 0.04, d - 0.04],
        [w / 2 - 0.04, d - 0.04],
      ].map(([x, z]) => (
        <Leg key={`${x}:${z}`} height={legs} top={0.015} bottom={0.01} position={[x, 0, z]}>
          <WoodMaterial tint="#9b7a59" />
        </Leg>
      ))}
    </group>
  );
}

/** Livros deitados empilhados (cores do quarto/escritório). */
export function Books({ colors }: { colors: string[] }) {
  const books = colors.map((color, i) => ({ color, h: 0.025 + (i % 3) * 0.008, w: 0.22 - i * 0.015, d: 0.16 - i * 0.01 }));
  const tops = books.map((_, i) => books.slice(0, i).reduce((sum, book) => sum + book.h, 0));
  return (
    <group>
      {books.map((book, i) => (
        <mesh key={i} position={[(i % 2) * 0.01, tops[i] + book.h / 2, 0]} rotation-y={(i - 1) * 0.08}>
          <boxGeometry args={[book.w, book.h, book.d]} />
          <Matte color={book.color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------------------- escritório */

/** Escrivaninha: tampo de madeira e pés finos de metal. */
export function Desk() {
  const { width: W, depth: D, height: H } = DESK;
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.32} />
      <Block size={[W, 0.03, D]} radius={0.012} bevel={0.006} position={[0, H - 0.015, D / 2]}>
        <WoodMaterial />
      </Block>
      {[
        [-W / 2 + 0.05, 0.05],
        [W / 2 - 0.05, 0.05],
        [-W / 2 + 0.05, D - 0.05],
        [W / 2 - 0.05, D - 0.05],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, (H - 0.03) / 2, z]}>
          <boxGeometry args={[0.03, H - 0.03, 0.03]} />
          <MetalMaterial />
        </mesh>
      ))}
      <mesh position={[0, H - 0.08, 0.05]}>
        <boxGeometry args={[W - 0.1, 0.05, 0.02]} />
        <MetalMaterial />
      </mesh>
    </group>
  );
}

/** Notebook aberto (tela acesa de leve). */
export function Laptop() {
  return (
    <group>
      <mesh position-y={0.008}>
        <boxGeometry args={[0.32, 0.016, 0.22]} />
        <MetalMaterial color="#b8bcc2" roughness={0.3} />
      </mesh>
      <group position={[0, 0.016, -0.11]} rotation-x={-0.26}>
        <mesh position-y={0.105}>
          <boxGeometry args={[0.32, 0.21, 0.008]} />
          <MetalMaterial color="#b8bcc2" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.105, 0.0045]}>
          <planeGeometry args={[0.3, 0.19]} />
          <meshStandardMaterial color="#1d2633" emissive="#5d7ea6" emissiveIntensity={0.35} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

/** Luminária de mesa articulada. */
export function DeskLamp() {
  return (
    <group>
      <mesh position-y={0.01}>
        <cylinderGeometry args={[0.07, 0.075, 0.02, 28]} />
        <MetalMaterial />
      </mesh>
      <mesh position={[0, 0.2, -0.04]} rotation-x={-0.2}>
        <cylinderGeometry args={[0.008, 0.008, 0.38, 8]} />
        <MetalMaterial />
      </mesh>
      <mesh position={[0, 0.39, 0.06]} rotation-x={1.1}>
        <cylinderGeometry args={[0.008, 0.008, 0.26, 8]} />
        <MetalMaterial />
      </mesh>
      <mesh position={[0, 0.43, 0.18]} rotation-x={0.5}>
        <coneGeometry args={[0.07, 0.12, 24, 1, true]} />
        <meshStandardMaterial color="#232427" metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Cadeira de escritório (olhando para a mesa, em -z). */
export function OfficeChair() {
  return (
    <group>
      <ContactShadow size={[0.62, 0.62]} position={[0, 0.002, 0]} opacity={0.4} round />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation-y={a}>
            <mesh position={[0.16, 0.05, 0]}>
              <boxGeometry args={[0.32, 0.03, 0.04]} />
              <MetalMaterial />
            </mesh>
            <mesh position={[0.3, 0.025, 0]}>
              <sphereGeometry args={[0.025, 12, 8]} />
              <MetalMaterial color="#141416" />
            </mesh>
          </group>
        );
      })}
      <mesh position-y={0.26}>
        <cylinderGeometry args={[0.022, 0.026, 0.4, 12]} />
        <MetalMaterial color="#9ea2a8" roughness={0.3} />
      </mesh>
      <Block size={[0.5, 0.08, 0.48]} radius={0.06} bevel={0.03} position={[0, 0.48, 0]}>
        <FabricMaterial color="#2f3236" />
      </Block>
      <Block size={[0.46, 0.55, 0.07]} radius={0.08} bevel={0.03} position={[0, 0.84, 0.25]} rotation={[0.12, 0, 0]}>
        <FabricMaterial color="#2f3236" />
      </Block>
    </group>
  );
}

const BOOK_COLORS = ["#2e4a5c", "#b5553c", "#d8c7a6", "#5f7059", "#e3dccf", "#3a3a3e", "#a7864f", "#7a8ea1"];
const SHELVES = [0.06, 0.48, 0.9, 1.32, BOOKCASE.height - 0.03];

/** Estante aberta com livros e um vaso. */
export function Bookcase() {
  const { width: W, depth: D, height: H } = BOOKCASE;
  const ref = useRef<THREE.InstancedMesh>(null);
  const shelves = SHELVES;
  const bookGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useGeometryCleanup(bookGeometry);
  const count = 34;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const random = rng(61);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const turn = new THREE.Quaternion();
    let n = 0;
    for (let s = 0; s < 3 && n < count; s += 1) {
      let x = -BOOKCASE.width / 2 + 0.04;
      const limit = s === 1 ? 0.05 : BOOKCASE.width / 2 - 0.05;
      while (x < limit && n < count) {
        const w = 0.02 + random() * 0.025;
        const h = 0.2 + random() * 0.12;
        matrix.compose(new THREE.Vector3(x + w / 2, SHELVES[s] + 0.012 + h / 2, BOOKCASE.depth / 2 + 0.01), turn, new THREE.Vector3(w, h, 0.2 + random() * 0.04));
        mesh.setMatrixAt(n, matrix);
        mesh.setColorAt(n, color.set(BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)]));
        x += w + 0.002;
        n += 1;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bookGeometry]);
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.4} />
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (W / 2 - 0.012), H / 2, D / 2]}>
          <boxGeometry args={[0.024, H, D]} />
          <WoodMaterial />
        </mesh>
      ))}
      {shelves.map((y) => (
        <mesh key={y} position={[0, y, D / 2]}>
          <boxGeometry args={[W - 0.02, 0.024, D]} />
          <WoodMaterial />
        </mesh>
      ))}
      <instancedMesh ref={ref} args={[bookGeometry, undefined, count]}>
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
      <group position={[0.2, shelves[1] + 0.012, D / 2]}>
        <mesh position-y={0.08}>
          <cylinderGeometry args={[0.06, 0.05, 0.16, 20]} />
          <Matte color="#e8e2d6" roughness={0.6} />
        </mesh>
      </group>
      <group position={[-0.15, shelves[3] + 0.012, D / 2]}>
        <Books colors={["#d8c7a6", "#2e4a5c", "#b5553c"]} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------- recepção */

/** Balcão de recepção: corpo claro, tampo de madeira e rodapé recuado. */
export function Counter({ color }: { color: string }) {
  const { width: W, depth: D, height: H } = COUNTER;
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.5} />
      <mesh position={[0, 0.04, D / 2]}>
        <boxGeometry args={[W - 0.06, 0.08, D - 0.06]} />
        <Matte color="#2a2b2f" />
      </mesh>
      <Block size={[W, H - 0.12, D]} radius={0.02} bevel={0.01} position={[0, 0.08 + (H - 0.12) / 2, D / 2]}>
        <Matte color={color} roughness={0.55} />
      </Block>
      <Block size={[W + 0.06, 0.04, D + 0.06]} radius={0.015} bevel={0.008} position={[0, H - 0.02, D / 2]}>
        <WoodMaterial roughness={0.45} />
      </Block>
    </group>
  );
}

/** Banco de espera: assento estofado sobre estrutura de madeira. */
export function Bench({ color }: { color: string }) {
  const { width: W, depth: D, height: H } = BENCH;
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.4} />
      <Block size={[W, 0.05, D]} radius={0.015} bevel={0.008} position={[0, H - 0.085, D / 2]}>
        <WoodMaterial />
      </Block>
      <Block size={[W - 0.04, 0.07, D - 0.04]} radius={0.04} bevel={0.03} position={[0, H - 0.03, D / 2]}>
        <FabricMaterial color={color} />
      </Block>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (W / 2 - 0.05), (H - 0.11) / 2, D / 2]}>
          <boxGeometry args={[0.04, H - 0.11, D - 0.06]} />
          <WoodMaterial />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------------------- cozinha */

/** Aparador baixo de madeira com portas e pés palito. */
export function Sideboard() {
  const { width: W, depth: D, height: H } = SIDEBOARD;
  const legs = 0.16;
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.4} />
      <Block size={[W, H - legs, D]} radius={0.015} bevel={0.008} position={[0, legs + (H - legs) / 2, D / 2]}>
        <WoodMaterial />
      </Block>
      {[-W / 4, 0, W / 4].map((x) => (
        <mesh key={x} position={[x, legs + (H - legs) / 2, D + 0.001]}>
          <boxGeometry args={[0.005, H - legs - 0.04, 0.002]} />
          <Matte color="#4a3626" />
        </mesh>
      ))}
      {[
        [-W / 2 + 0.06, 0.06],
        [W / 2 - 0.06, 0.06],
        [-W / 2 + 0.06, D - 0.06],
        [W / 2 - 0.06, D - 0.06],
      ].map(([x, z]) => (
        <Leg key={`${x}:${z}`} height={legs} top={0.016} bottom={0.01} position={[x, 0, z]}>
          <WoodMaterial tint="#9b7a59" />
        </Leg>
      ))}
    </group>
  );
}

/** Mesa de jantar de madeira com pés cônicos. */
export function DiningTable() {
  const { width: W, depth: D, height: H } = DINING;
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, 0]} opacity={0.3} />
      <Block size={[W, 0.04, D]} radius={0.03} bevel={0.01} position={[0, H - 0.02, 0]}>
        <WoodMaterial />
      </Block>
      {[
        [-W / 2 + 0.08, -D / 2 + 0.08],
        [W / 2 - 0.08, -D / 2 + 0.08],
        [-W / 2 + 0.08, D / 2 - 0.08],
        [W / 2 - 0.08, D / 2 - 0.08],
      ].map(([x, z]) => (
        <Leg key={`${x}:${z}`} height={H - 0.04} top={0.025} bottom={0.017} position={[x, 0, z]}>
          <WoodMaterial />
        </Leg>
      ))}
    </group>
  );
}

/** Cadeira de madeira com assento estofado (de frente para +z). */
export function DiningChair({ color }: { color: string }) {
  return (
    <group>
      <ContactShadow size={[0.46, 0.46]} position={[0, 0.002, 0]} opacity={0.3} />
      <Block size={[0.44, 0.05, 0.42]} radius={0.04} bevel={0.02} position={[0, 0.455, 0]}>
        <FabricMaterial color={color} />
      </Block>
      <Block size={[0.42, 0.3, 0.03]} radius={0.03} bevel={0.012} position={[0, 0.78, -0.2]} rotation={[-0.08, 0, 0]}>
        <WoodMaterial />
      </Block>
      {[
        [-0.18, -0.18],
        [0.18, -0.18],
        [-0.18, 0.18],
        [0.18, 0.18],
      ].map(([x, z]) => (
        <Leg key={`${x}:${z}`} height={z < 0 ? 0.66 : 0.43} top={0.016} bottom={0.013} position={[x, 0, z]}>
          <WoodMaterial />
        </Leg>
      ))}
    </group>
  );
}

/** Bancada da cozinha encostada na parede da esquerda: armários, tampo de pedra, azulejo e prateleira. */
export function KitchenRun({ length = KITCHEN_RUN.length }: { length?: number }) {
  const { wallTile } = useTextures();
  const { depth: D, height: H } = KITCHEN_RUN;
  const doors = Math.max(2, Math.round(length / 0.6));
  return (
    <group>
      <mesh position={[D / 2, 0.05, length / 2]}>
        <boxGeometry args={[D - 0.06, 0.1, length]} />
        <Matte color="#2c2c30" />
      </mesh>
      <Block size={[D, H - 0.14, length]} radius={0.01} bevel={0.006} position={[D / 2, 0.1 + (H - 0.14) / 2, length / 2]}>
        <Matte color="#dcd7ce" roughness={0.5} />
      </Block>
      {Array.from({ length: doors - 1 }, (_, i) => (
        <mesh key={i} position={[D + 0.001, 0.1 + (H - 0.14) / 2, ((i + 1) * length) / doors]}>
          <boxGeometry args={[0.002, H - 0.18, 0.005]} />
          <Matte color="#9e978b" />
        </mesh>
      ))}
      <Block size={[D + 0.02, 0.04, length + 0.02]} radius={0.01} bevel={0.006} position={[D / 2 + 0.01, H - 0.02, length / 2]}>
        <meshStandardMaterial color="#e9e6e0" roughness={0.25} />
      </Block>
      {wallTile && (
        <mesh position={[0.004, H + 0.3, length / 2]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[length, 0.6]} />
          <meshStandardMaterial map={wallTile} roughness={0.3} />
        </mesh>
      )}
      <mesh position={[D * 0.55, H + 0.001, length * 0.3]}>
        <boxGeometry args={[0.38, 0.004, 0.5]} />
        <MetalMaterial color="#8d9196" roughness={0.25} />
      </mesh>
      <group position={[0.1, H, length * 0.3]}>
        <mesh position-y={0.14}>
          <cylinderGeometry args={[0.012, 0.012, 0.28, 10]} />
          <MetalMaterial color="#c9ccd1" roughness={0.2} />
        </mesh>
        <mesh position={[0.07, 0.27, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.01, 0.01, 0.15, 10]} />
          <MetalMaterial color="#c9ccd1" roughness={0.2} />
        </mesh>
      </group>
      <Block size={[0.26, 0.03, length * 0.55]} radius={0.01} bevel={0.006} position={[0.13, 1.75, length * 0.62]}>
        <WoodMaterial />
      </Block>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0.12, 1.75 + 0.015 + 0.08, length * 0.45 + i * 0.16]}>
          <cylinderGeometry args={[0.045, 0.045, 0.16, 18]} />
          <meshStandardMaterial color={["#e9e3d6", "#c9b48f", "#e4ddd2"][i]} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Pendente sobre a mesa: fio do teto e cúpula em domo acesa por dentro. */
export function Pendant({ drop }: { drop: number }) {
  const dome = useMemo(
    () =>
      lathe(
        [
          [0.02, 0.2],
          [0.06, 0.19],
          [0.15, 0.12],
          [0.2, 0.02],
          [0.21, 0],
        ],
        32,
      ),
    [],
  );
  useGeometryCleanup(dome);
  return (
    <group>
      <mesh position-y={-drop / 2}>
        <cylinderGeometry args={[0.004, 0.004, drop, 6]} />
        <Matte color="#1d1d1f" />
      </mesh>
      <mesh geometry={dome} position-y={-drop - 0.2}>
        <meshStandardMaterial color="#2a2b2e" roughness={0.45} metalness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={-drop - 0.17}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshBasicMaterial color="#ffe2b0" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------------------- banheiro */

const BASIN: [number, number][] = [
  [0, 0],
  [0.1, 0],
  [0.17, 0.05],
  [0.2, 0.12],
  [0.205, 0.14],
  [0.19, 0.14],
  [0.185, 0.125],
  [0.155, 0.06],
  [0.09, 0.025],
  [0, 0.022],
];

/** Gabinete suspenso de madeira, cuba de apoio, misturador e espelho redondo. */
export function Vanity() {
  const { width: W, depth: D, height: H } = VANITY;
  const basin = useMemo(() => lathe(BASIN, 40), []);
  useGeometryCleanup(basin);
  return (
    <group>
      <ContactShadow size={[W, D]} position={[0, 0.002, D / 2]} opacity={0.18} />
      <Block size={[W, 0.5, D]} radius={0.012} bevel={0.006} position={[0, H - 0.27, D / 2]}>
        <WoodMaterial />
      </Block>
      <Block size={[W + 0.02, 0.03, D + 0.02]} radius={0.01} bevel={0.005} position={[0, H - 0.005, D / 2]}>
        <meshStandardMaterial color="#efedea" roughness={0.3} />
      </Block>
      <mesh geometry={basin} position={[0, H + 0.01, D / 2 + 0.02]}>
        <meshStandardMaterial color="#fbfaf8" roughness={0.18} />
      </mesh>
      <group position={[0, H + 0.01, 0.06]}>
        <mesh position-y={0.16}>
          <cylinderGeometry args={[0.014, 0.016, 0.32, 12]} />
          <MetalMaterial color="#c9ccd1" roughness={0.18} />
        </mesh>
        <mesh position={[0, 0.31, 0.07]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.011, 0.011, 0.15, 10]} />
          <MetalMaterial color="#c9ccd1" roughness={0.18} />
        </mesh>
      </group>
      <group position={[0, 1.6, 0.012]}>
        <mesh>
          <circleGeometry args={[0.32, 48]} />
          <meshStandardMaterial color="#d9dde0" metalness={1} roughness={0.06} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.325, 0.012, 10, 64]} />
          <MetalMaterial color="#b89a64" roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** Prateleira flutuante (apoia a fonte do neon), com um vasinho e livros. */
export function FloatingShelf() {
  return (
    <group>
      <Block size={[1, 0.03, 0.22]} radius={0.008} bevel={0.005} position={[0, -0.015, 0.11]}>
        <WoodMaterial />
      </Block>
      <group position={[-0.36, 0, 0.11]}>
        <Books colors={["#3a3a3e", "#a7864f"]} />
      </group>
      <group position={[0.4, 0, 0.11]}>
        <mesh position-y={0.05}>
          <cylinderGeometry args={[0.045, 0.038, 0.1, 18]} />
          <Matte color="#d9d2c6" roughness={0.6} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[Math.cos(i * 1.3) * 0.02, 0.13 + (i % 2) * 0.02, Math.sin(i * 1.3) * 0.02]} rotation={[Math.cos(i) * 0.5, i, Math.sin(i * 1.7) * 0.5]}>
            <sphereGeometry args={[0.04, 10, 8]} />
            <Matte color="#4f7a45" roughness={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
