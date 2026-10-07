"use client";

// Cotas da peça na sala, desenhadas em cm: o grupo pai (posicionado pelo palco) escala para a cena.
// Os rótulos acompanham o tamanho real da peça (legíveis no enquadramento da sala, que mostra o móvel).

import { useEffect, useMemo } from "react";
import { Billboard, Line } from "@react-three/drei";
import * as THREE from "three";
import { createLabel } from "../models/shared";

type V3 = [number, number, number];

function RoomLabel({ text, light, height, position, align = "center" }: { text: string; light: boolean; height: number; position: V3; align?: "center" | "left" }) {
  const label = useMemo(() => createLabel(text, light), [text, light]);
  useEffect(() => () => label.texture.dispose(), [label]);
  const width = height * label.aspect;
  return (
    <Billboard position={position}>
      <mesh renderOrder={10} position-x={align === "left" ? width / 2 : 0}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={label.texture} transparent depthTest={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/**
 * Largura (embaixo ou em cima, no papel de parede) e altura (à direita) da peça, com os rótulos da
 * medida pedida. `light`: traço e rótulo brancos (sala noturna do neon).
 */
export function RoomDims({ widthCm, heightCm, labels, light, widthOnTop = false }: { widthCm: number; heightCm: number; labels: [string, string]; light: boolean; widthOnTop?: boolean }) {
  const w = Math.max(widthCm, 1);
  const h = Math.max(heightCm, 1);
  const unit = Math.max(w, h);
  const gap = THREE.MathUtils.clamp(unit * 0.035, 2, 9);
  const tick = gap * 0.5;
  const labelH = THREE.MathUtils.clamp(unit * 0.065, 3.2, 13);
  const color = light ? "#ffffff" : "#0a0a0a";
  const y = widthOnTop ? h / 2 + gap : -h / 2 - gap;
  const x = w / 2 + gap;
  return (
    <group userData={{ noBounds: true }}>
      <Line points={[[-w / 2, y, 0], [w / 2, y, 0]]} color={color} lineWidth={1.4} />
      <Line points={[[-w / 2, y - tick, 0], [-w / 2, y + tick, 0]]} color={color} lineWidth={1.4} />
      <Line points={[[w / 2, y - tick, 0], [w / 2, y + tick, 0]]} color={color} lineWidth={1.4} />
      <Line points={[[x, -h / 2, 0], [x, h / 2, 0]]} color={color} lineWidth={1.4} />
      <Line points={[[x - tick, -h / 2, 0], [x + tick, -h / 2, 0]]} color={color} lineWidth={1.4} />
      <Line points={[[x - tick, h / 2, 0], [x + tick, h / 2, 0]]} color={color} lineWidth={1.4} />
      <RoomLabel text={labels[0]} light={light} height={labelH} position={[0, y + (widthOnTop ? 1 : -1) * (labelH * 0.5 + tick * 1.2), 0]} />
      <RoomLabel text={labels[1]} light={light} height={labelH} position={[x + tick * 1.6, 0, 0]} align="left" />
    </group>
  );
}
