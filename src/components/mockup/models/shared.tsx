"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Line } from "@react-three/drei";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { type ArtSettings, type ArtVariant, canvasFor, fontFamily, loadImage, paintArt, shapeMask } from "../art";
import { useAnimate } from "../viewer-hooks";

export type MaskPath = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;


export function useArtImage(src: string | null) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src)
      .then((image) => alive && setLoaded({ src, image }))
      .catch(() => alive && setLoaded(null));
    return () => {
      alive = false;
    };
  }, [src]);
  return src && loaded?.src === src ? loaded.image : null;
}


export function createArtTexture(aspect: number) {
  const canvas = canvasFor(aspect);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, texture };
}


export function repaintArt(
  target: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture },
  variant: ArtVariant,
  art: ArtSettings,
  image: HTMLImageElement | null,
  label: string,
  mask?: MaskPath,
) {
  paintArt(target.canvas, variant, art, image, label);
  if (mask) shapeMask(target.canvas, mask);
  target.texture.needsUpdate = true;
}


export function useArtTexture(aspect: number, variant: ArtVariant, art: ArtSettings, label: string, mask?: MaskPath) {
  const image = useArtImage(art.src);
  const target = useMemo(() => createArtTexture(aspect), [aspect]);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true));
  }, []);
  useEffect(() => {
    repaintArt(target, variant, art, image, label, mask);
  }, [target, variant, art, image, label, mask, fontsReady]);
  useEffect(() => () => target.texture.dispose(), [target]);
  return target.texture;
}


export function roughnessOf(spec: MockupSpec) {
  if (spec.finish === "matte") return 0.85;
  if (spec.finish === "gloss") return 0.22;
  return 0.5;
}


export function PrintMaterial({ map, spec, transparent = false }: { map: THREE.Texture; spec: MockupSpec; transparent?: boolean }) {
  return (
    <meshPhysicalMaterial
      map={map}
      roughness={roughnessOf(spec)}
      clearcoat={spec.clearcoat}
      clearcoatRoughness={0.08}
      transparent={transparent}
      alphaTest={transparent ? 0.5 : 0}
      side={THREE.FrontSide}
    />
  );
}


export function makeShape(kind: MockupSpec["shape"], w: number, h: number, radius: number) {
  const shape = new THREE.Shape();
  if (kind === "round") {
    shape.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return shape;
  }
  if (kind === "heart") {
    const x = -w / 2;
    const y = -h / 2;
    shape.moveTo(x + w / 2, y + h * 0.05);
    shape.bezierCurveTo(x - w * 0.1, y + h * 0.45, x + w * 0.1, y + h * 1.05, x + w / 2, y + h * 0.75);
    shape.bezierCurveTo(x + w * 0.9, y + h * 1.05, x + w * 1.1, y + h * 0.45, x + w / 2, y + h * 0.05);
    return shape;
  }
  const r = Math.min(radius, w / 2, h / 2);
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}


export function faceGeometry(shape: THREE.Shape, w: number, h: number) {
  const geometry = new THREE.ShapeGeometry(shape, 48);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}


export type SlabProps = {
  w: number;
  h: number;
  d: number;
  spec: MockupSpec;
  front: THREE.Texture;
  back?: THREE.Texture;
  radius?: number;
  edgeColor?: string;
  edgeMaterial?: React.ReactNode;
  backColor?: string;
};


export function Slab({ w, h, d, spec, front, back, radius = 0, edgeColor = "#f4f4f4", edgeMaterial, backColor }: SlabProps) {
  const shape = useMemo(() => makeShape(spec.shape, w, h, radius), [spec.shape, w, h, radius]);
  const edge = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 48 });
    g.translate(0, 0, -d / 2);
    return g;
  }, [shape, d]);
  const face = useMemo(() => faceGeometry(shape, w, h), [shape, w, h]);
  useEffect(() => () => edge.dispose(), [edge]);
  useEffect(() => () => face.dispose(), [face]);
  return (
    <group>
      <mesh geometry={edge} castShadow receiveShadow>
        {edgeMaterial ?? <meshStandardMaterial color={edgeColor} roughness={0.9} />}
      </mesh>
      <mesh geometry={face} position-z={d / 2 + 0.0008}>
        <PrintMaterial map={front} spec={spec} />
      </mesh>
      <mesh geometry={face} position-z={-d / 2 - 0.0008} rotation-y={Math.PI}>
        {back ? (
          <PrintMaterial map={back} spec={spec} />
        ) : (
          <meshStandardMaterial color={backColor ?? "#fafafa"} roughness={0.9} />
        )}
      </mesh>
    </group>
  );
}


export function Dimensions({ w, h, z, labelW, labelH, light = false }: { w: number; h: number; z: number; labelW: string; labelH: string; light?: boolean }) {
  const gap = 0.12;
  const tick = 0.05;
  const color = light ? "#ffffff" : "#0a0a0a";
  return (
    <group position-z={z} userData={{ noBounds: true }}>
      <Line points={[[-w / 2, -h / 2 - gap, 0], [w / 2, -h / 2 - gap, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[-w / 2, -h / 2 - gap - tick, 0], [-w / 2, -h / 2 - gap + tick, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2, -h / 2 - gap - tick, 0], [w / 2, -h / 2 - gap + tick, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2 + gap, -h / 2, 0], [w / 2 + gap, h / 2, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2 + gap - tick, -h / 2, 0], [w / 2 + gap + tick, -h / 2, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2 + gap - tick, h / 2, 0], [w / 2 + gap + tick, h / 2, 0]]} color={color} lineWidth={1.2} />
      <DimLabel text={labelW} light={light} position={[0, -h / 2 - gap - 0.12, 0]} />
      <DimLabel text={labelH} light={light} position={[w / 2 + gap + 0.24, 0, 0]} />
    </group>
  );
}


export function createLabel(text: string, light: boolean) {
  const scale = 4;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `600 ${13 * scale}px ${fontFamily()}`;
  if (ctx) ctx.font = font;
  const textW = ctx ? ctx.measureText(text).width : text.length * 7 * scale;
  canvas.width = Math.ceil(textW + 22 * scale);
  canvas.height = 26 * scale;
  if (ctx) {
    ctx.fillStyle = light ? "#ffffff" : "#0a0a0a";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = light ? "#0a0a0a" : "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + scale);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}


export function DimLabel({ text, position, light = false }: { text: string; position: [number, number, number]; light?: boolean }) {
  const label = useMemo(() => createLabel(text, light), [text, light]);
  useEffect(() => () => label.texture.dispose(), [label]);
  const h = 0.13;
  return (
    <Billboard position={position}>
      <mesh renderOrder={10}>
        <planeGeometry args={[h * label.aspect, h]} />
        <meshBasicMaterial map={label.texture} transparent depthTest={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}


export function sizeLabels(spec: MockupSpec): [string, string] {
  const fmt = (v: number) => (v >= 100 ? `${(v / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m` : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`);
  return [fmt(spec.widthCm), fmt(spec.heightCm)];
}


export type ModelProps = { spec: MockupSpec; art: ArtSettings; label: string; showDims: boolean };


export function fitFlat(spec: MockupSpec, target = 2.4) {
  const scale = target / Math.max(spec.widthCm, spec.heightCm);
  return { w: spec.widthCm * scale, h: spec.heightCm * scale, scale };
}


export function backVariant(spec: MockupSpec): ArtVariant {
  if (spec.back === "gray") return "gray";
  if (spec.back === "same") return "front";
  return "blank";
}


export function Standoffs({ w, h, z }: { w: number; h: number; z: number }) {
  const inset = 0.1;
  return (
    <>
      {[
        [-w / 2 + inset, h / 2 - inset],
        [w / 2 - inset, h / 2 - inset],
        [-w / 2 + inset, -h / 2 + inset],
        [w / 2 - inset, -h / 2 + inset],
      ].map(([x, y]) => (
        <mesh key={`${x}-${y}`} position={[x, y, z]} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.06, 24]} />
          <meshStandardMaterial color="#d6d6d6" metalness={1} roughness={0.25} />
        </mesh>
      ))}
    </>
  );
}


export function Tube({ length, radius = 0.028, color = "#f7f7f7", position }: { length: number; radius?: number; color?: string; position: [number, number, number] }) {
  return (
    <mesh position={position} rotation-z={Math.PI / 2} castShadow>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      <meshStandardMaterial color={color} roughness={0.4} />
    </mesh>
  );
}


export function Cord({ points }: { points: THREE.Vector3[] }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.006, 8), [points]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
    </mesh>
  );
}


export function wave(geometry: THREE.BufferGeometry, w: number, h: number, t: number, strength: number, anchor: "left" | "top") {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const along = anchor === "left" ? (x + w / 2) / w : (h / 2 - y) / h;
    pos.setZ(i, Math.sin(x * 3.2 + y * 1.4 + t * 2.2) * strength * along + Math.sin(y * 2 + t * 1.3) * strength * 0.3 * along);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}


export function Waving({ w, h, texture, strength = 0.08, anchor = "left" }: { w: number; h: number; texture: THREE.Texture; strength?: number; anchor?: "left" | "top" }) {
  const geometry = useRef<THREE.PlaneGeometry>(null);
  const animate = useAnimate();
  const time = useRef(0);
  useLayoutEffect(() => {
    if (geometry.current) wave(geometry.current, w, h, 0, strength, anchor);
  }, [w, h, strength, anchor]);
  useFrame((state, delta) => {
    if (!animate || !geometry.current) return;
    time.current += Math.min(delta, 0.1);
    wave(geometry.current, w, h, time.current, strength, anchor);
    state.invalidate();
  });
  return (
    <mesh castShadow>
      <planeGeometry ref={geometry} args={[w, h, 48, 48]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} transparent alphaTest={0.5} roughness={0.8} />
    </mesh>
  );
}


export function metalColor(metal: MockupSpec["metal"]) {
  if (metal === "gold") return "#e8c26a";
  if (metal === "rose") return "#e9a99b";
  return "#e2e4e7";
}


export function pillowGeometry(w: number, h: number, thickness: number, shape: MockupSpec["shape"]) {
  const g = new THREE.PlaneGeometry(w, h, 64, 64);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const u = (pos.getX(i) / w) * 2;
    const v = (pos.getY(i) / h) * 2;
    let f: number;
    if (shape === "rect") f = Math.pow(Math.max(0, 1 - u * u), 0.4) * Math.pow(Math.max(0, 1 - v * v), 0.4);
    else {
      const r = Math.sqrt(u * u + v * v);
      f = r < 1 ? Math.pow(1 - r * r, 0.45) : 0;
    }
    pos.setZ(i, (thickness / 2) * f);
  }
  g.computeVertexNormals();
  return g;
}


export function Spiral({ length, axis, offset, count = 14 }: { length: number; axis: "x" | "y"; offset: [number, number, number]; count?: number }) {
  return (
    <group position={offset}>
      {Array.from({ length: count }, (_, i) => {
        const t = (i / (count - 1) - 0.5) * length * 0.9;
        return (
          <mesh key={i} position={axis === "y" ? [0, t, 0] : [t, 0, 0]} rotation={axis === "y" ? [Math.PI / 2, 0, 0] : [0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.05, 0.008, 8, 24]} />
            <meshStandardMaterial color="#c8ccd2" metalness={1} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

