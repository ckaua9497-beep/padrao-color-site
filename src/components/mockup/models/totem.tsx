"use client";

// Totem elíptico de chão (kind totem): duas folhas de duplex curvadas em arco, a da frente e a do verso, unidas
// pelas bordas verticais. A seção é uma lente (os dois arcos se encontram em quina viva nas emendas laterais) e
// a peça é aberta em cima e embaixo: sem tampa nem base, fica em pé apoiada nas bordas das folhas, como nas fotos
// do produto.
//
// Modelado em centímetros dentro de um grupo com escala `s` (unidades de cena por cm). A largura do formato é a da
// folha impressa (planificada): cada face é um arco de círculo com esse comprimento, então a arte do editor (mesma
// proporção do formato) entra 1:1, sem esticar nem espremer; a corda (a largura da peça montada) sai um pouco
// menor. Uma linha discreta no meio da altura marca a emenda das folhas, que aparece em todas as fotos.

import { useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { hasArtContent } from "../art";
import { Dimensions, PrintMaterial, backVariant, sizeLabels, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

/**
 * Meio ângulo do arco de cada face (rad). Com 0,75 a folha de 50 cm fecha numa corda de ~45 cm e a peça
 * montada tem ~18 cm de fundo (as duas flechas), a proporção da vista lateral das fotos.
 */
const HALF_ANGLE = 0.75;
/** Giro de 3/4: a frente olha um pouco para a esquerda e a emenda da direita aparece. */
const STUDIO_YAW = -0.42;
/** Verso do duplex (lado de dentro): cinza claro, sem impressão. */
const DUPLEX_BACK = "#d6d2ca";

// ---------------------------------------------------------------------------- arco

/** Arco de uma face: raio, flecha (quanto a face avança sobre a linha das emendas) e meia corda. */
function faceArc(width: number) {
  const radius = width / (2 * HALF_ANGLE);
  return { radius, sagitta: radius * (1 - Math.cos(HALF_ANGLE)), halfChord: radius * Math.sin(HALF_ANGLE) };
}

/**
 * Face impressa: arco de círculo do chão até `height`, com as emendas em z = 0 e o meio em z = flecha. O U da
 * arte segue o comprimento do arco (a folha planificada), o V a altura.
 */
function faceGeometry(radius: number, height: number, columns = 160) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const base = radius * Math.cos(HALF_ANGLE);
  for (const y of [0, height]) {
    for (let i = 0; i <= columns; i += 1) {
      const u = i / columns;
      const phi = -HALF_ANGLE + 2 * HALF_ANGLE * u;
      positions.push(radius * Math.sin(phi), y, radius * Math.cos(phi) - base);
      normals.push(Math.sin(phi), 0, Math.cos(phi));
      uvs.push(u, y / height);
    }
  }
  const stride = columns + 1;
  for (let i = 0; i < columns; i += 1) indices.push(i, i + 1, i + stride, i + 1, i + stride + 1, i + stride);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Filete sobre o arco (emenda horizontal do meio), afastado `offset` da face, de `y - w/2` a `y + w/2`. */
function seamGeometry(radius: number, y: number, w: number, offset: number, columns = 96) {
  const positions: number[] = [];
  const indices: number[] = [];
  const base = radius * Math.cos(HALF_ANGLE);
  const r = radius + offset;
  for (const yy of [y - w / 2, y + w / 2]) {
    for (let i = 0; i <= columns; i += 1) {
      const phi = -HALF_ANGLE + (2 * HALF_ANGLE * i) / columns;
      positions.push(r * Math.sin(phi), yy, r * Math.cos(phi) - base);
    }
  }
  const stride = columns + 1;
  for (let i = 0; i < columns; i += 1) indices.push(i, i + 1, i + stride, i + 1, i + stride + 1, i + stride);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// ---------------------------------------------------------------------------- arte

/** Arte própria do verso, quando o cliente preencheu (sem texto de exemplo). */
function useBackArt(art: ModelProps["art"]): ModelProps["art"] | null {
  const back = art.back ?? null;
  const filled = hasArtContent(back);
  const { kind, surface, opaque } = art;
  return useMemo(
    () => (back && filled ? { ...back, back: null, ledColors: undefined, sample: false, kind, surface, opaque } : null),
    [back, filled, kind, surface, opaque],
  );
}

// ---------------------------------------------------------------------------- modelo

/**
 * Totem Elíptico (50×150, 70×170 ou 70×194 cm): duas faces curvas impressas de ponta a ponta, unidas em quina
 * nas laterais, abertas em cima e embaixo. Sem arte própria no verso, o verso repete a frente (impressão
 * frente e verso); por dentro aparece o verso cinza do duplex.
 */
export function TotemModel({ spec, art, label, showDims }: ModelProps) {
  const W = Math.max(spec.widthCm, 20);
  const H = Math.max(spec.heightCm, 40);
  const s = 2.6 / Math.max(W, H);
  const { radius, sagitta, halfChord } = faceArc(W);
  // Arte na proporção do formato (a mesma do editor): a folha inteira de cada face.
  const aspect = artAspect(spec);

  const front = useArtTexture(aspect, "front", art, label);
  const backArt = useBackArt(art);
  const twoSided = !/4\/[01]/.test(spec.details ?? "");
  const reuseFront = !backArt && twoSided;
  const backTexture = useArtTexture(aspect, backArt ? "front" : reuseFront ? "blank" : backVariant(spec), backArt ?? art, label);
  const back = reuseFront ? front : backTexture;

  const face = useMemo(() => faceGeometry(radius, H), [radius, H]);
  const seam = useMemo(() => seamGeometry(radius, H / 2, 0.22, 0.04), [radius, H]);
  useGeometryCleanup(face);
  useGeometryCleanup(seam);

  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={STUDIO_YAW} userData={{ unitsPerCm: s }}>
      <group scale={s}>
        {[0, Math.PI].map((turn) => (
          <group key={turn} rotation-y={turn}>
            <mesh geometry={face} castShadow receiveShadow>
              <PrintMaterial map={turn ? back : front} spec={spec} />
            </mesh>
            {/* Lado de dentro da folha: o verso cinza do duplex, visto pela boca de cima. */}
            <mesh geometry={face} receiveShadow>
              <meshStandardMaterial color={DUPLEX_BACK} roughness={0.9} side={THREE.BackSide} />
            </mesh>
            <mesh geometry={seam} renderOrder={1}>
              <meshBasicMaterial color="#000000" transparent opacity={0.16} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
          </group>
        ))}
        {/* Emendas laterais: as duas folhas se encontram em quina viva (a linha pontilhada da vista lateral). */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (halfChord + 0.02), H / 2, 0]} rotation-y={(side * Math.PI) / 2} renderOrder={1}>
            <planeGeometry args={[0.35, H]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
        ))}
      </group>
      {showDims && (
        <group position={[0, (H * s) / 2, sagitta * s + 0.02]}>
          <Dimensions w={2 * halfChord * s} h={H * s} z={0} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}
