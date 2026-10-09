"use client";

// Fachada de loja (simulador de fachadas, /fachadas): calçada com meio-fio, pilares com rodapé de granito,
// porta de aço de enrolar recolhida (a barra de lâminas e os trilhos), vitrine de vidro temperado com porta e
// puxadores, a placa em ACM com a arte do cliente na platibanda e refletores de LED em braço. O prédio é
// montado em cm em volta da placa (spec.widthCm × spec.heightCm = a medida da fachada que vai impressa).
// O interior da loja aparece pelo vidro, mas fica fora do enquadramento (userData.noFrame): a câmera
// enquadra a frente e a calçada, e a placa ocupa a maior parte da largura.
// Foco na arte (o cliente clicou num estilo): o visualizador leva a câmera de frente para a placa e os
// refletores (userData.focus) e escurece o estúdio; aqui os refletores acendem, com uma piscada, e iluminam a
// placa (lightMap: forte em cima, abrindo para baixo), com as lentes acesas, o brilho em volta delas, um facho
// leve e a luz que escapa para a parede.

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { rng } from "../environments/textures";
import { useAnimate, useSceneMode } from "../viewer-hooks";
import { Dimensions, roughnessOf, sizeLabels, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

type V3 = [number, number, number];
type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Medidas fixas da loja, em cm. */
const OPENING_H = 270; // vão da vitrine, do piso ao topo
const LINTEL = 24; // viga entre o vão e a placa
const PARAPET = 30; // platibanda acima da placa
const WALL = 28; // espessura da parede da frente
const DEPTH = 360; // fundo da loja
const WALK = 150; // calçada
const CURB = 14; // altura do meio-fio
const KERB = 14; // largura do meio-fio
const MARGIN = 40; // calçada além das paredes, dos dois lados
const SIGN_OUT = 9; // frente da placa em relação à parede
const SIGN_RETURN = 6; // dobra (retorno) da caixa de ACM
const ROLL_BAND = 26; // lâminas da porta de enrolar que ficam à vista, recolhida
const GLASS_Z = -17; // plano do vidro (recuado do alinhamento da parede)
const DOOR_H = 226; // altura da porta (a bandeira fica acima)
const INNER = 18; // espessura das paredes laterais

/* ------------------------------------------------------------------------------------- texturas */

function canvasTexture(width: number, height: number, paint: Paint, color = true): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Grão fino em cada pixel (reboco, concreto, granito). */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const random = rng(seed);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = (random() - 0.5) * amount;
    data[i] += v;
    data[i + 1] += v;
    data[i + 2] += v;
  }
  ctx.putImageData(image, 0, 0);
}

/** Manchas largas e suaves, repetidas nas bordas para a textura emendar sem costura. */
function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, rgb: [number, number, number], alpha: number, radius: [number, number], seed: number) {
  const random = rng(seed);
  const [r, g, b] = rgb;
  for (let i = 0; i < count; i += 1) {
    const x = random() * w;
    const y = random() * h;
    const size = radius[0] + random() * (radius[1] - radius[0]);
    const a = alpha * (0.3 + random() * 0.7);
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + size < 0 || cx - size > w || cy + size < 0 || cy - size > h) continue;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
      }
    }
  }
}

/** Pedrisco: pontos claros e escuros (concreto, calçada, granito). */
function flecks(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, tones: [string, string], size: number, seed: number) {
  const random = rng(seed);
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = random() < 0.5 ? tones[0] : tones[1];
    const s = size * (0.5 + random());
    ctx.fillRect(random() * w, random() * h, s, s);
  }
}

/** Reboco pintado (1 repetição = 150 cm): branco com manchas e grão; a cor vem do material. */
const paintPlaster: Paint = (ctx, w, h) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 90, [150, 140, 128], 0.07, [18, 80], 5);
  grain(ctx, w, h, 12, 6);
};

/** Placas de concreto da calçada (1 repetição = 100 cm, 2 × 2 placas de 50 cm com junta). */
const paintPavers: Paint = (ctx, w, h) => {
  const random = rng(17);
  const n = 2;
  const cell = w / n;
  const joint = w * 0.014;
  ctx.fillStyle = "#77746f";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const tone = 192 + (random() - 0.5) * 22;
      ctx.fillStyle = `rgb(${tone},${tone - 3},${tone - 9})`;
      ctx.fillRect(i * cell + joint / 2, j * cell + joint / 2, cell - joint, cell - joint);
    }
  }
  blotches(ctx, w, h, 70, [96, 90, 82], 0.1, [8, 46], 19);
  flecks(ctx, w, h, 2400, ["rgba(250,250,246,0.45)", "rgba(70,66,60,0.35)"], 1.6, 21);
  grain(ctx, w, h, 18, 23);
};

/** Concreto liso (meio-fio, base, telhado): 1 repetição = 120 cm. */
const paintConcrete: Paint = (ctx, w, h) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 80, [120, 116, 108], 0.12, [10, 60], 31);
  flecks(ctx, w, h, 1400, ["rgba(255,255,255,0.5)", "rgba(80,78,74,0.3)"], 1.4, 33);
  grain(ctx, w, h, 16, 35);
};

/** Granito escuro do rodapé (1 repetição = 60 cm). */
const paintGranite: Paint = (ctx, w, h) => {
  ctx.fillStyle = "#3a3b3e";
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 40, [20, 20, 22], 0.35, [6, 26], 41);
  flecks(ctx, w, h, 2600, ["rgba(200,198,194,0.55)", "rgba(10,10,12,0.6)"], 1.8, 43);
  flecks(ctx, w, h, 220, ["rgba(240,238,232,0.8)", "rgba(120,104,90,0.5)"], 3, 45);
  grain(ctx, w, h, 10, 47);
};

/** Lâminas onduladas da porta de enrolar (1 repetição = 32 cm de altura, 4 lâminas de 8 cm). */
const paintSlats: Paint = (ctx, w, h) => {
  const slats = 4;
  const pitch = h / slats;
  for (let i = 0; i < slats; i += 1) {
    const y = i * pitch;
    const gradient = ctx.createLinearGradient(0, y, 0, y + pitch);
    gradient.addColorStop(0, "#f2f4f5");
    gradient.addColorStop(0.18, "#d9dde0");
    gradient.addColorStop(0.55, "#b4b9be");
    gradient.addColorStop(0.86, "#8d9298");
    gradient.addColorStop(1, "#5f646a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, w, pitch);
    ctx.fillStyle = "rgba(30,32,36,0.65)";
    ctx.fillRect(0, y + pitch - 2, w, 2);
  }
  grain(ctx, w, h, 8, 51);
};

/** Porcelanato do piso da loja (1 repetição = 120 cm, 2 × 2 peças de 60 cm). */
const paintPorcelain: Paint = (ctx, w, h) => {
  const random = rng(61);
  const cell = w / 2;
  const joint = w * 0.006;
  ctx.fillStyle = "#bdb6aa";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      const tone = 230 + (random() - 0.5) * 8;
      ctx.fillStyle = `rgb(${tone},${tone - 5},${tone - 13})`;
      ctx.fillRect(i * cell + joint / 2, j * cell + joint / 2, cell - joint, cell - joint);
    }
  }
  blotches(ctx, w, h, 30, [170, 160, 146], 0.12, [20, 70], 63);
  grain(ctx, w, h, 6, 65);
};

/**
 * Reflexo do vidro: céu mais claro em cima e faixas diagonais suaves. A cor vai no `map` e a força do reflexo
 * no `alphaMap` (canal verde): o vidro fica quase transparente embaixo e espelha mais em cima.
 */
const paintGlassTint: Paint = (ctx, w, h) => {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#f4f8fa");
  sky.addColorStop(0.5, "#dfe9ee");
  sky.addColorStop(1, "#c9d6dc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
};
const paintGlassAlpha: Paint = (ctx, w, h) => {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "rgb(120,120,120)");
  base.addColorStop(0.45, "rgb(62,62,62)");
  base.addColorStop(1, "rgb(38,38,38)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Faixas diagonais de reflexo, como o brilho de um vidro de vitrine.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.5);
  for (const [x, width, alpha] of [
    [-0.34, 0.12, 0.3],
    [-0.16, 0.05, 0.22],
    [0.18, 0.16, 0.24],
    [0.38, 0.04, 0.2],
  ] as const) {
    const gradient = ctx.createLinearGradient((x - width) * w, 0, (x + width) * w, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect((x - width) * w, -h, width * 2 * w, h * 2);
  }
  ctx.restore();
};

/** Folhagem do buxinho: verdes salpicados (a cor final vem do material). */
const paintLeaves: Paint = (ctx, w, h) => {
  ctx.fillStyle = "#6c9a52";
  ctx.fillRect(0, 0, w, h);
  const random = rng(71);
  for (let i = 0; i < 2600; i += 1) {
    const l = 22 + random() * 40;
    ctx.fillStyle = `hsl(${92 + random() * 26}, ${34 + random() * 22}%, ${l}%)`;
    const x = random() * w;
    const y = random() * h;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + random() * 3, 1 + random() * 2, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
};

type StoreTextures = {
  plaster: THREE.CanvasTexture;
  pavers: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  granite: THREE.CanvasTexture;
  slats: THREE.CanvasTexture;
  porcelain: THREE.CanvasTexture;
  glassTint: THREE.CanvasTexture;
  glassAlpha: THREE.CanvasTexture;
  leaves: THREE.CanvasTexture;
};

function useStoreTextures(): StoreTextures {
  const textures = useMemo<StoreTextures>(() => {
    const glassTint = canvasTexture(64, 256, paintGlassTint);
    const glassAlpha = canvasTexture(256, 256, paintGlassAlpha, false);
    // O reflexo cobre o vão inteiro (não repete).
    glassTint.wrapS = glassTint.wrapT = THREE.ClampToEdgeWrapping;
    glassAlpha.wrapS = glassAlpha.wrapT = THREE.ClampToEdgeWrapping;
    return {
      plaster: canvasTexture(512, 512, paintPlaster),
      pavers: canvasTexture(512, 512, paintPavers),
      concrete: canvasTexture(256, 256, paintConcrete),
      granite: canvasTexture(256, 256, paintGranite),
      slats: canvasTexture(16, 128, paintSlats),
      porcelain: canvasTexture(256, 256, paintPorcelain),
      glassTint,
      glassAlpha,
      leaves: canvasTexture(256, 256, paintLeaves),
    };
  }, []);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
  return textures;
}

/* ------------------------------------------------------------------------------------ geometria */

/** Caixa com UV em cm: a textura repete a cada `unit` cm em todas as faces (paredes de qualquer tamanho). */
function boxGeometry(w: number, h: number, d: number, unit: number) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  // Faces na ordem do BoxGeometry: +x, −x (d × h), +y, −y (w × d), +z, −z (w × h).
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f += 1) {
    for (let i = 0; i < 4; i += 1) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * faces[f][0]) / unit, (uv.getY(k) * faces[f][1]) / unit);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

function Box({ size, position, unit = 100, rotation, children }: { size: V3; position: V3; unit?: number; rotation?: V3; children: ReactNode }) {
  const [w, h, d] = size;
  const geometry = useMemo(() => boxGeometry(w, h, d, unit), [w, h, d, unit]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      {children}
    </mesh>
  );
}

/* ---------------------------------------------------------------------------------------- peças */

const ALUMINUM_BLACK = "#232528";
const STEEL = "#c4c8cc";

/** Alumínio preto anodizado dos caixilhos. */
function FrameMaterial() {
  return <meshStandardMaterial color={ALUMINUM_BLACK} metalness={0.55} roughness={0.42} />;
}

/** Inox escovado (puxadores e ferragens da porta de vidro). */
function SteelMaterial() {
  return <meshStandardMaterial color={STEEL} metalness={1} roughness={0.28} />;
}

/** Calçada de placas de concreto com meio-fio, e a base do prédio (fora do enquadramento). */
function Ground({ width, tex }: { width: number; tex: StoreTextures }) {
  const base = width + MARGIN * 2;
  return (
    <group>
      <Box size={[base, CURB, WALK]} position={[0, -CURB / 2, WALK / 2]} unit={100}>
        <meshStandardMaterial map={tex.pavers} roughness={0.92} />
      </Box>
      <Box size={[base, CURB + 1.2, KERB]} position={[0, -CURB / 2 + 0.6, WALK + KERB / 2]} unit={120}>
        <meshStandardMaterial map={tex.concrete} color="#bab7b1" roughness={0.88} />
      </Box>
      <group userData={{ noFrame: true }}>
        <Box size={[base, CURB, DEPTH + 20]} position={[0, -CURB / 2, -(DEPTH + 20) / 2]} unit={120}>
          <meshStandardMaterial map={tex.concrete} color="#a4a19b" roughness={0.9} />
        </Box>
      </group>
    </group>
  );
}

/** Paredes: pilares, viga e platibanda na frente; laterais, fundo e laje fora do enquadramento. */
function Shell({ width, pillar, top, wallColor, tex }: { width: number; pillar: number; top: number; wallColor: string; tex: StoreTextures }) {
  const open = width - pillar * 2;
  const header = top - OPENING_H;
  const back = DEPTH - WALL;
  const roofY = top - PARAPET - 22;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box size={[pillar, top, WALL]} position={[side * (width / 2 - pillar / 2), top / 2, -WALL / 2]} unit={150}>
            <meshStandardMaterial map={tex.plaster} color={wallColor} roughness={0.93} />
          </Box>
          {/* Rodapé de granito: na frente e virando a quina do pilar. */}
          <Box size={[pillar + 2, 44, 2]} position={[side * (width / 2 - pillar / 2), 22, 1]} unit={60}>
            <meshStandardMaterial map={tex.granite} roughness={0.32} />
          </Box>
          <Box size={[2, 44, WALL + 2]} position={[side * (width / 2 + 1), 22, -WALL / 2 + 1]} unit={60}>
            <meshStandardMaterial map={tex.granite} roughness={0.32} />
          </Box>
        </group>
      ))}
      <Box size={[open, header, WALL]} position={[0, OPENING_H + header / 2, -WALL / 2]} unit={150}>
        <meshStandardMaterial map={tex.plaster} color={wallColor} roughness={0.93} />
      </Box>
      {/* Pingadeira de concreto no topo da platibanda. */}
      <Box size={[width + 8, 5, WALL + 7]} position={[0, top + 2.5, -WALL / 2 + 1.5]} unit={120}>
        <meshStandardMaterial map={tex.concrete} color="#d6d3cd" roughness={0.85} />
      </Box>
      <group userData={{ noFrame: true }}>
        {[-1, 1].map((side) => (
          <Box key={side} size={[INNER, top, back]} position={[side * (width / 2 - INNER / 2), top / 2, -WALL - back / 2]} unit={150}>
            <meshStandardMaterial map={tex.plaster} color={wallColor} roughness={0.93} />
          </Box>
        ))}
        <Box size={[width, roofY, 12]} position={[0, roofY / 2, -DEPTH + 6]} unit={150}>
          <meshStandardMaterial map={tex.plaster} color="#ece4d6" roughness={0.93} />
        </Box>
        {/* Laje do telhado, escondida atrás da platibanda. */}
        <Box size={[width - INNER * 2, 12, back]} position={[0, roofY + 6, -WALL - back / 2]} unit={120}>
          <meshStandardMaterial map={tex.concrete} color="#8f8c87" roughness={0.95} />
        </Box>
      </group>
    </group>
  );
}

type SignProps = {
  w: number;
  h: number;
  y: number;
  front: THREE.Texture;
  /** Luz dos refletores na placa (lightMap); a força vem de lightUp, conforme os refletores acendem. */
  light: THREE.Texture;
  roughness: number;
  materialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

/** Placa em ACM (caixa com retorno de 6 cm, afastada da parede) com a arte do cliente na frente. */
function Sign({ w, h, y, front, light, roughness, materialRef }: SignProps) {
  return (
    <group position={[0, y + h / 2, 0]}>
      <Box size={[w, h, SIGN_RETURN]} position={[0, 0, SIGN_OUT - SIGN_RETURN / 2]} unit={100}>
        <meshStandardMaterial color="#d3d6da" metalness={0.6} roughness={0.32} />
      </Box>
      <mesh position-z={SIGN_OUT + 0.05}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial ref={materialRef} map={front} lightMap={light} roughness={roughness} />
      </mesh>
      {/* Sombra da placa na parede (o vão de 3 cm atrás da caixa). */}
      <mesh position={[0, -2, 0.15]}>
        <planeGeometry args={[w + 6, h + 4]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Refletor de LED em braço curvo, preso na platibanda e apontado para a placa. */
function Spotlight({ x, y, target, lamp, beam }: { x: number; y: number; target: [number, number]; lamp: LampMaterials; beam: THREE.BufferGeometry }) {
  const arm = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, 7, 18), new THREE.Vector3(0, 9, 34), new THREE.Vector3(0, 4, 46)]);
    return new THREE.TubeGeometry(curve, 24, 1.4, 10, false);
  }, []);
  useGeometryCleanup(arm);
  const head: V3 = [0, 1, 50];
  // Lente (+z do refletor) apontada para o centro da placa.
  const dy = target[0] - (y + head[1]);
  const dz = target[1] - head[2];
  const tilt = Math.atan2(-dy, dz);
  return (
    <group position={[x, y, 0]}>
      <mesh position-z={0.6}>
        <boxGeometry args={[7, 9, 1.2]} />
        <FrameMaterial />
      </mesh>
      <mesh geometry={arm}>
        <FrameMaterial />
      </mesh>
      <group position={head} rotation-x={tilt}>
        <mesh>
          <boxGeometry args={[21, 15, 5]} />
          <meshStandardMaterial color="#1b1c1f" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Aletas de dissipação atrás da lente. */}
        {[-8, -4, 0, 4, 8].map((fx) => (
          <mesh key={fx} position={[fx, 0, -3.4]}>
            <boxGeometry args={[1, 13, 2]} />
            <meshStandardMaterial color="#1b1c1f" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        {/* Lira (suporte em U) segurando o refletor. */}
        <mesh position={[0, 8, -1]}>
          <boxGeometry args={[23, 1.2, 3]} />
          <FrameMaterial />
        </mesh>
        <mesh position-z={2.55} material={lamp.lens}>
          <planeGeometry args={[18, 12]} />
        </mesh>
        {/* Aceso: o facho até a placa e o brilho em volta da lente (fora do enquadramento). */}
        <mesh geometry={beam} position-z={2.6} material={lamp.beam} userData={{ noFrame: true }} />
        <Billboard position={[0, 0, 3.4]}>
          <mesh material={lamp.halo} userData={{ noFrame: true }}>
            <planeGeometry args={[48, 48]} />
          </mesh>
        </Billboard>
      </group>
    </group>
  );
}

/** Porta de aço de enrolar recolhida: trilhos nos dois lados do vão e a barra de lâminas à vista no topo. */
function RollingDoor({ open, tex }: { open: number; tex: StoreTextures }) {
  const span = open - 12;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (open / 2 - 3), OPENING_H / 2, -6]}>
          <Box size={[6, OPENING_H, 1]} position={[0, 0, 3]} unit={32}>
            <meshStandardMaterial color="#9da3a9" metalness={0.75} roughness={0.42} />
          </Box>
          <Box size={[1, OPENING_H, 7]} position={[side * 2.5, 0, 0]} unit={32}>
            <meshStandardMaterial color="#9da3a9" metalness={0.75} roughness={0.42} />
          </Box>
        </group>
      ))}
      <Box size={[span, ROLL_BAND, 3]} position={[0, OPENING_H - ROLL_BAND / 2, -6]} unit={32}>
        <meshStandardMaterial map={tex.slats} metalness={0.7} roughness={0.45} />
      </Box>
      {/* Soleira em T da porta, com o puxador central. */}
      <Box size={[span, 3, 5]} position={[0, OPENING_H - ROLL_BAND - 1.5, -6]} unit={32}>
        <meshStandardMaterial color="#6f757b" metalness={0.8} roughness={0.38} />
      </Box>
      <mesh position={[0, OPENING_H - ROLL_BAND - 5, -3.4]}>
        <boxGeometry args={[14, 4, 1.2]} />
        <meshStandardMaterial color="#6f757b" metalness={0.8} roughness={0.38} />
      </mesh>
    </group>
  );
}

/** Folha de vidro temperado da porta (sem caixilho), com ferragens e puxador tubular de inox. */
function DoorLeaf({ x, width, hinge, tex }: { x: number; width: number; hinge: 1 | -1; tex: StoreTextures }) {
  // `hinge`: lado do pivô (+1 direita, −1 esquerda); o puxador fica no lado oposto.
  const handleX = -hinge * (width / 2 - 9);
  return (
    <group position={[x, 0, GLASS_Z + 3]}>
      <mesh position-y={DOOR_H / 2 + 0.5}>
        <boxGeometry args={[width - 0.6, DOOR_H - 1, 1]} />
        <GlassMaterial tex={tex} />
      </mesh>
      {/* Ferragens de pivô e fechadura nos cantos (inox). */}
      {[3.5, DOOR_H - 3.5].map((fy) => (
        <mesh key={fy} position={[hinge * (width / 2 - 9), fy, 0]}>
          <boxGeometry args={[17, 6.5, 2.4]} />
          <SteelMaterial />
        </mesh>
      ))}
      <mesh position={[handleX, 3.5, 0]}>
        <boxGeometry args={[12, 6.5, 2.4]} />
        <SteelMaterial />
      </mesh>
      {/* Puxador dos dois lados do vidro. */}
      {[1, -1].map((face) => (
        <group key={face} position={[handleX, 108, face * 5.2]}>
          <mesh>
            <cylinderGeometry args={[1.6, 1.6, 120, 16]} />
            <SteelMaterial />
          </mesh>
          {[-48, 48].map((sy) => (
            <mesh key={sy} position={[0, sy, -face * 2.6]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.9, 0.9, 5.2, 10]} />
              <SteelMaterial />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function GlassMaterial({ tex }: { tex: StoreTextures }) {
  return (
    <meshStandardMaterial
      map={tex.glassTint}
      alphaMap={tex.glassAlpha}
      transparent
      depthWrite={false}
      color="#e3eef1"
      metalness={0.2}
      roughness={0.04}
      envMapIntensity={1.6}
      side={THREE.DoubleSide}
    />
  );
}

/** Vitrine de vidro temperado: caixilho, bandeira acima da porta, montantes e a porta (uma ou duas folhas). */
function Shopfront({ open, tex }: { open: number; tex: StoreTextures }) {
  const inner = open - 18; // entre os trilhos da porta de enrolar
  const top = OPENING_H - ROLL_BAND - 3;
  const doorW = inner >= 420 ? 180 : THREE.MathUtils.clamp(inner * 0.3, 90, 110);
  const leaves = doorW >= 160 ? 2 : 1;
  const leafW = doorW / leaves;
  // Painéis fixos dos lados, divididos por montantes a cada ~1,4 m.
  const sideW = (inner - doorW) / 2;
  const panes = Math.max(1, Math.ceil(sideW / 140));
  const mullions: number[] = [];
  for (const side of [-1, 1]) {
    for (let i = 1; i < panes; i += 1) mullions.push(side * (doorW / 2 + (sideW * i) / panes));
  }
  return (
    <group>
      {/* Vidro fixo dos lados e da bandeira (atrás dos montantes). */}
      <mesh position={[0, top / 2, GLASS_Z]}>
        <planeGeometry args={[inner, top]} />
        <GlassMaterial tex={tex} />
      </mesh>
      <Box size={[inner + 4, 6, 7]} position={[0, top - 3, GLASS_Z]} unit={100}>
        <FrameMaterial />
      </Box>
      <Box size={[inner + 4, 4, 9]} position={[0, 2, GLASS_Z]} unit={100}>
        <FrameMaterial />
      </Box>
      {[-1, 1].map((side) => (
        <Box key={side} size={[5, top, 7]} position={[side * (inner / 2 + 0.5), top / 2, GLASS_Z]} unit={100}>
          <FrameMaterial />
        </Box>
      ))}
      {/* Travessa da bandeira e montantes da porta. */}
      <Box size={[inner, 5, 7]} position={[0, DOOR_H + 2.5, GLASS_Z]} unit={100}>
        <FrameMaterial />
      </Box>
      {[-1, 1].map((side) => (
        <Box key={side} size={[5, DOOR_H, 7]} position={[side * (doorW / 2 + 2.5), DOOR_H / 2, GLASS_Z]} unit={100}>
          <FrameMaterial />
        </Box>
      ))}
      {mullions.map((mx) => (
        <Box key={mx} size={[4, top, 6]} position={[mx, top / 2, GLASS_Z]} unit={100}>
          <FrameMaterial />
        </Box>
      ))}
      {leaves === 2 ? (
        <>
          <DoorLeaf x={-leafW / 2} width={leafW} hinge={-1} tex={tex} />
          <DoorLeaf x={leafW / 2} width={leafW} hinge={1} tex={tex} />
        </>
      ) : (
        <DoorLeaf x={0} width={leafW} hinge={1} tex={tex} />
      )}
    </group>
  );
}

const PRODUCT_COLORS = ["#ff463a", "#18b0e8", "#f8e028", "#e02888", "#b0c818", "#f6f1e7", "#282e34", "#f0a000"];

/** Interior visto pelo vidro: piso de porcelanato, forro com painéis de LED, estante com produtos e balcão. */
function Interior({ width, top, tex }: { width: number; top: number; tex: StoreTextures }) {
  const inside = width - INNER * 2;
  const back = DEPTH - WALL;
  // Forro a 3 m, sempre abaixo da laje (placa baixa = platibanda baixa).
  const ceiling = Math.min(300, top - PARAPET - 26);
  const shelfW = Math.min(inside - 90, 420);
  const products = useMemo(() => {
    const random = rng(Math.round(shelfW));
    const out: { position: V3; size: V3; color: string }[] = [];
    for (const y of [42, 86, 130, 174]) {
      let x = -shelfW / 2 + 6;
      while (x < shelfW / 2 - 14) {
        const w = 10 + random() * 16;
        const h = 14 + random() * 22;
        if (x + w > shelfW / 2 - 6) break;
        if (random() > 0.18) out.push({ position: [x + w / 2, y + 1.5 + h / 2, -DEPTH + 30], size: [w, h, 14 + random() * 10], color: PRODUCT_COLORS[Math.floor(random() * PRODUCT_COLORS.length)] });
        x += w + 2 + random() * 5;
      }
    }
    return out;
  }, [shelfW]);
  const panels = Math.max(1, Math.floor(inside / 170));
  return (
    <group userData={{ noFrame: true }}>
      <Box size={[inside, 1, back]} position={[0, 0.5, -WALL - back / 2]} unit={120}>
        <meshStandardMaterial map={tex.porcelain} roughness={0.3} />
      </Box>
      <Box size={[inside, 2, back]} position={[0, ceiling + 1, -WALL - back / 2]} unit={150}>
        <meshStandardMaterial color="#f4f2ee" roughness={0.95} />
      </Box>
      {Array.from({ length: panels }, (_, i) => -inside / 2 + (inside * (i + 0.5)) / panels).flatMap((px) =>
        [-WALL - back * 0.3, -WALL - back * 0.72].map((pz) => (
          <mesh key={`${px}:${pz}`} position={[px, ceiling - 0.2, pz]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#ffffff" emissive="#fff4df" emissiveIntensity={0.9} side={THREE.DoubleSide} />
          </mesh>
        )),
      )}
      {/* Estante no fundo: montantes, prateleiras e caixas coloridas. */}
      <group>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (shelfW / 2), 100, -DEPTH + 30]}>
            <boxGeometry args={[3, 200, 36]} />
            <meshStandardMaterial color="#2a2b2e" roughness={0.6} />
          </mesh>
        ))}
        {[40, 84, 128, 172].map((sy) => (
          <mesh key={sy} position={[0, sy, -DEPTH + 30]}>
            <boxGeometry args={[shelfW, 3, 36]} />
            <meshStandardMaterial color="#d8cbb5" roughness={0.7} />
          </mesh>
        ))}
        {products.map((p, i) => (
          <mesh key={i} position={p.position}>
            <boxGeometry args={p.size} />
            <meshStandardMaterial color={p.color} roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* Balcão de atendimento à esquerda. */}
      <group position={[-inside / 2 + 95, 0, -WALL - back * 0.55]}>
        <mesh position-y={48}>
          <boxGeometry args={[140, 96, 55]} />
          <meshStandardMaterial color="#efece6" roughness={0.75} />
        </mesh>
        <mesh position-y={98}>
          <boxGeometry args={[146, 4, 60]} />
          <meshStandardMaterial color="#7a5a3e" roughness={0.55} />
        </mesh>
      </group>
      {/* Tapete na entrada. */}
      <mesh position={[0, 1.6, -WALL - 40]}>
        <boxGeometry args={[130, 1.2, 60]} />
        <meshStandardMaterial color="#2c2d30" roughness={1} />
      </mesh>
    </group>
  );
}

/** Buxinho podado num vaso de concreto, na calçada ao lado da vitrine. */
function Planter({ x, tex }: { x: number; tex: StoreTextures }) {
  const shrub = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(25, 4);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      v.fromBufferAttribute(position, i);
      // Folhagem irregular: o raio varia com a direção (mesmo valor nos vértices repetidos).
      const n = Math.sin(v.x * 0.31) * Math.cos(v.y * 0.27) * Math.sin(v.z * 0.35) + Math.sin(v.x * 0.9 + v.z * 0.7) * 0.4;
      v.multiplyScalar(1 + n * 0.06);
      position.setXYZ(i, v.x, v.y * 0.92, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  useGeometryCleanup(shrub);
  return (
    <group position={[x, 0, 34]}>
      <Box size={[46, 48, 46]} position={[0, 24, 0]} unit={120}>
        <meshStandardMaterial map={tex.concrete} color="#6f7174" roughness={0.85} />
      </Box>
      <mesh position-y={48.2} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#3b2c20" roughness={1} />
      </mesh>
      <mesh geometry={shrub} position-y={48 + 22}>
        <meshStandardMaterial map={tex.leaves} color="#c9dcbf" roughness={0.95} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------------------- refletores acesos */

/** Os refletores acendem quando a câmera está quase chegando na placa (s). */
const LAMP_DELAY = 0.55;
/** lightMapIntensity da placa com os refletores acesos (≈ π = a luz toda sobre a arte, no topo). */
const SIGN_LIGHT = 3.2;
/** Meia abertura do facho (rad). */
const BEAM_ANGLE = 0.56;

/** Acendimento do refletor de LED: liga, pisca uma vez e firma. 0 = apagado, 1 = aceso. */
function lampCurve(t: number): number {
  const u = t - LAMP_DELAY;
  if (u <= 0) return 0;
  if (u < 0.06) return 0.8;
  if (u < 0.13) return 0.12;
  if (u < 0.19) return 0.92;
  if (u < 0.25) return 0.4;
  return Math.min(1, 0.4 + ((u - 0.25) / 0.3) * 0.6);
}

/** Canvas na proporção da peça, com `long` px no lado maior. */
function sizedCanvas(aspect: number, long: number): [number, number] {
  return aspect >= 1 ? [long, Math.max(32, Math.round(long / aspect))] : [Math.max(32, Math.round(long * aspect)), long];
}

/** Brilho em volta da lente acesa. */
const paintHalo: Paint = (ctx, w, h) => {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.16, "rgba(255,248,232,0.75)");
  gradient.addColorStop(0.5, "rgba(255,240,214,0.16)");
  gradient.addColorStop(1, "rgba(255,236,206,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
};

/** Elipse radial somada ao que já está no canvas (poças de luz que se sobrepõem). */
function pool(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, stops: [number, string][]) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

/**
 * Luz dos refletores na placa (lightMap, em dados): um fundo que chega à placa toda e uma poça por refletor,
 * forte logo abaixo dele (no topo) e abrindo para baixo.
 */
function paintSignLight(fractions: readonly number[]): Paint {
  return (ctx, w, h) => {
    ctx.fillStyle = "rgb(66,66,66)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const rx = Math.max(w / fractions.length, h * 0.9);
    for (const f of fractions) {
      pool(ctx, f * w, -h * 0.15, rx, h * 1.8, [
        [0, "rgba(255,250,240,0.95)"],
        [0.4, "rgba(255,248,236,0.55)"],
        [1, "rgba(255,246,232,0)"],
      ]);
    }
    ctx.globalCompositeOperation = "source-over";
  };
}

/** Onde a luz que escapa da placa cai na parede: o plano (cm) e a placa dentro dele. */
type SpillLayout = { width: number; height: number; signW: number; signH: number; signBottom: number };

/** Luz que escapa da placa para a parede em volta (somada à cena), com as bordas do plano esfumadas. */
function paintSpill(fractions: readonly number[], layout: SpillLayout): Paint {
  return (ctx, w, h) => {
    const sx = w / layout.width;
    const sy = h / layout.height;
    ctx.globalCompositeOperation = "lighter";
    const rx = ((0.85 * layout.signW) / fractions.length + 40) * sx;
    const ry = (layout.signH * 0.5 + 38) * sy;
    for (const f of fractions) {
      const x = (layout.width / 2 + (f - 0.5) * layout.signW) * sx;
      const y = h - (layout.signBottom + layout.signH * 0.55) * sy;
      pool(ctx, x, y, rx, ry, [
        [0, "rgba(255,240,214,0.9)"],
        [0.55, "rgba(255,236,206,0.3)"],
        [1, "rgba(255,232,200,0)"],
      ]);
    }
    // Sem corte reto onde o plano acaba.
    ctx.globalCompositeOperation = "destination-in";
    for (const [x1, y1] of [
      [w, 0],
      [0, h],
    ]) {
      const fade = ctx.createLinearGradient(0, 0, x1, y1);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.12, "rgba(0,0,0,1)");
      fade.addColorStop(0.88, "rgba(0,0,0,1)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
  };
}

function clampedTexture(width: number, height: number, paint: Paint, color: boolean): THREE.CanvasTexture {
  const texture = canvasTexture(width, height, paint, color);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Facho do refletor: cone aberto com o vértice na lente (z = 0) e a boca a `length` cm, ao longo de +z. */
function beamGeometry(length: number): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(length * Math.tan(BEAM_ANGLE), length, 32, 1, true);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, length / 2);
  return geometry;
}

const BEAM_VERTEX = /* glsl */ `
  uniform float beamLength;
  varying float vAlong;
  varying vec3 vNormalView;
  varying vec3 vToCamera;
  void main() {
    vAlong = clamp(position.z / beamLength, 0.0, 1.0);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vToCamera = normalize(-view.xyz);
    gl_Position = projectionMatrix * view;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float opacity;
  uniform vec3 color;
  varying float vAlong;
  varying vec3 vNormalView;
  varying vec3 vToCamera;
  void main() {
    // Mais denso perto da lente e no miolo do cone (de frente para a câmera); some na boca e nas bordas.
    float core = pow(abs(dot(normalize(vNormalView), normalize(vToCamera))), 1.6);
    float along = pow(1.0 - vAlong, 1.3) * smoothstep(0.0, 0.08, vAlong);
    gl_FragColor = vec4(color, opacity * core * along);
  }
`;

/** Materiais dos refletores, um de cada para todos (a força acompanha o acendimento em lightUp). */
type LampMaterials = {
  lens: THREE.MeshStandardMaterial;
  halo: THREE.MeshBasicMaterial;
  beam: THREE.ShaderMaterial;
  spill: THREE.MeshBasicMaterial;
  haloMap: THREE.CanvasTexture;
};

function createLampMaterials(): LampMaterials {
  const haloMap = clampedTexture(64, 64, paintHalo, true);
  const glow = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, visible: false } as const;
  return {
    lens: new THREE.MeshStandardMaterial({ color: "#f4f1ea", emissive: "#fff6e2", emissiveIntensity: 0.5, roughness: 0.2 }),
    halo: new THREE.MeshBasicMaterial({ ...glow, map: haloMap, color: "#fff1d8" }),
    beam: new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 }, beamLength: { value: 1 }, color: { value: new THREE.Color("#fff3df") } },
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      visible: false,
    }),
    spill: new THREE.MeshBasicMaterial({ ...glow, color: "#fff3e2" }),
    haloMap,
  };
}

function disposeLampMaterials(lamp: LampMaterials) {
  lamp.lens.dispose();
  lamp.halo.dispose();
  lamp.beam.dispose();
  lamp.spill.dispose();
  lamp.haloMap.dispose();
}

function fitLampMaterials(lamp: LampMaterials, spill: THREE.Texture, beamLength: number) {
  lamp.spill.map = spill;
  lamp.spill.needsUpdate = true;
  lamp.beam.uniforms.beamLength.value = beamLength;
}

/** Aplica o nível de luz dos refletores (0 apagados, 1 acesos) na placa, nas lentes, no brilho e no facho. */
function lightUp(lamp: LampMaterials, sign: THREE.MeshStandardMaterial | null, level: number) {
  const on = level > 0.002;
  if (sign) sign.lightMapIntensity = level * SIGN_LIGHT;
  lamp.lens.emissiveIntensity = 0.5 + level * 6;
  lamp.halo.opacity = level * 0.85;
  lamp.halo.visible = on;
  lamp.beam.uniforms.opacity.value = level * 0.16;
  lamp.beam.visible = on;
  lamp.spill.opacity = level * 0.6;
  lamp.spill.visible = on;
}

/**
 * Nível de luz dos refletores a cada quadro: acendem (com a piscada) quando o foco liga e apagam rápido quando
 * ele desliga. Montado já em foco (outra medida com a placa em foco), entram acesos, sem piscar de novo.
 * Sem animação (fora da tela ou movimento reduzido), o nível vai direto ao fim.
 */
function useLampLevel(on: boolean, apply: (level: number) => void) {
  const animate = useAnimate();
  const invalidate = useThree((state) => state.invalidate);
  const lamp = useRef({ level: -1, since: on ? -Infinity : -1 });
  useEffect(() => {
    invalidate();
  }, [on, invalidate]);
  useFrame(({ clock }, delta) => {
    const state = lamp.current;
    let level: number;
    if (on) {
      if (state.since === -1) state.since = clock.elapsedTime;
      level = animate ? lampCurve(clock.elapsedTime - state.since) : 1;
    } else {
      state.since = -1;
      level = animate ? Math.max(0, state.level - delta / 0.3) : 0;
    }
    if (level !== state.level) {
      state.level = level;
      apply(level);
    }
    if (animate && (on ? level < 1 : level > 0)) invalidate();
  });
}

/* --------------------------------------------------------------------------------------- modelo */

export function StorefrontModel({ spec, art, label, showDims }: ModelProps) {
  const w = spec.widthCm;
  const h = spec.heightCm;
  // Pilares proporcionais à fachada; loja estreita (placa pequena) ainda tem vão para porta e vitrine.
  const pillar = THREE.MathUtils.clamp(w * 0.05, 22, 40);
  const width = Math.max(w + pillar * 2, 240);
  const open = width - pillar * 2;
  const signY = OPENING_H + LINTEL;
  const top = signY + h + PARAPET;
  // Cena em unidades do estúdio (~2,6 no maior lado), como os outros modelos.
  const s = 2.6 / Math.max(width + MARGIN * 2, top + CURB);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const tex = useStoreTextures();
  const lamps = THREE.MathUtils.clamp(Math.round(w / 140), 2, 10);
  const lampY = signY + h + 15;
  const [lw, lh] = sizeLabels(spec);

  // Refletores: a luz na placa e na parede segue a posição de cada um.
  const { focus } = useSceneMode();
  const fractions = useMemo(() => Array.from({ length: lamps }, (_, i) => (i + 0.5) / lamps), [lamps]);
  const signLight = useMemo(() => {
    const [cw, ch] = sizedCanvas(aspect, 512);
    return clampedTexture(cw, ch, paintSignLight(fractions), false);
  }, [aspect, fractions]);
  useEffect(() => () => signLight.dispose(), [signLight]);
  const spillBottom = signY - 60;
  const spillLayout = useMemo<SpillLayout>(() => ({ width: width - 2, height: top - spillBottom, signW: w, signH: h, signBottom: signY - spillBottom }), [width, top, spillBottom, w, h, signY]);
  const spill = useMemo(() => {
    const [cw, ch] = sizedCanvas(spillLayout.width / spillLayout.height, 256);
    return clampedTexture(cw, ch, paintSpill(fractions, spillLayout), true);
  }, [fractions, spillLayout]);
  useEffect(() => () => spill.dispose(), [spill]);
  // Da lente até o centro da placa (a cabeça do refletor fica 50 cm à frente da parede).
  const beamLength = Math.hypot(h / 2 + 16, 50 - SIGN_OUT) * 0.97;
  const beam = useMemo(() => beamGeometry(beamLength), [beamLength]);
  useGeometryCleanup(beam);
  const lamp = useMemo(() => createLampMaterials(), []);
  useEffect(() => () => disposeLampMaterials(lamp), [lamp]);
  useEffect(() => {
    fitLampMaterials(lamp, spill, beamLength);
  }, [lamp, spill, beamLength]);
  const signMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const apply = useCallback((level: number) => lightUp(lamp, signMaterial.current, level), [lamp]);
  useLampLevel(focus, apply);

  return (
    <group userData={{ view: { elevation: 0.05, azimuth: 0.2, distance: 0.74 } }}>
      <group scale={s}>
        <Ground width={width} tex={tex} />
        <Shell width={width} pillar={pillar} top={top} wallColor="#e4ddd2" tex={tex} />
        {/* Foco na arte: a câmera fica de frente para a placa e os refletores. */}
        <group userData={{ focus: { elevation: 0.02, margin: 1.1 } }}>
          <Sign w={w} h={h} y={signY} front={front} light={signLight} roughness={roughnessOf(spec)} materialRef={signMaterial} />
          {fractions.map((f) => (
            <Spotlight key={f} x={-w / 2 + w * f} y={lampY} target={[signY + h / 2, SIGN_OUT]} lamp={lamp} beam={beam} />
          ))}
        </group>
        <mesh position={[0, (spillBottom + top) / 2, 0.3]} material={lamp.spill} userData={{ noFrame: true }}>
          <planeGeometry args={[spillLayout.width, spillLayout.height]} />
        </mesh>
        <RollingDoor open={open} tex={tex} />
        <Shopfront open={open} tex={tex} />
        <Interior width={width} top={top} tex={tex} />
        {open >= 300 && [-1, 1].map((side) => <Planter key={side} x={side * (open / 2 - 36)} tex={tex} />)}
      </group>
      {showDims && !focus && (
        <group position={[0, (signY + h / 2) * s, (SIGN_OUT + 1) * s]}>
          <Dimensions w={w * s} h={h * s} z={0} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}
