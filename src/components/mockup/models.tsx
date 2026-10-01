"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Line, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import {
  type ArtSettings,
  type ArtVariant,
  canvasFor,
  featherPath,
  fontFamily,
  heartPath,
  loadImage,
  paintArt,
  roundPath,
  shapeMask,
} from "./art";

type MaskPath = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function useArtImage(src: string | null) {
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

function createArtTexture(aspect: number) {
  const canvas = canvasFor(aspect);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, texture };
}

function repaintArt(
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

function useArtTexture(aspect: number, variant: ArtVariant, art: ArtSettings, label: string, mask?: MaskPath) {
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

function roughnessOf(spec: MockupSpec) {
  if (spec.finish === "matte") return 0.85;
  if (spec.finish === "gloss") return 0.22;
  return 0.5;
}

function PrintMaterial({ map, spec, transparent = false }: { map: THREE.Texture; spec: MockupSpec; transparent?: boolean }) {
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

function makeShape(kind: MockupSpec["shape"], w: number, h: number, radius: number) {
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

function faceGeometry(shape: THREE.Shape, w: number, h: number) {
  const geometry = new THREE.ShapeGeometry(shape, 48);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

type SlabProps = {
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

function Slab({ w, h, d, spec, front, back, radius = 0, edgeColor = "#f4f4f4", edgeMaterial, backColor }: SlabProps) {
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

function Dimensions({ w, h, z, labelW, labelH, light = false }: { w: number; h: number; z: number; labelW: string; labelH: string; light?: boolean }) {
  const gap = 0.12;
  const tick = 0.05;
  const color = light ? "#ffffff" : "#0a0a0a";
  return (
    <group position-z={z}>
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

function createLabel(text: string, light: boolean) {
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

function DimLabel({ text, position, light = false }: { text: string; position: [number, number, number]; light?: boolean }) {
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

function sizeLabels(spec: MockupSpec): [string, string] {
  const fmt = (v: number) => (v >= 100 ? `${(v / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m` : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`);
  return [fmt(spec.widthCm), fmt(spec.heightCm)];
}

type ModelProps = { spec: MockupSpec; art: ArtSettings; label: string; showDims: boolean };

function fitFlat(spec: MockupSpec, target = 2.4) {
  const scale = target / Math.max(spec.widthCm, spec.heightCm);
  return { w: spec.widthCm * scale, h: spec.heightCm * scale, scale };
}

function backVariant(spec: MockupSpec): ArtVariant {
  if (spec.back === "gray") return "gray";
  if (spec.back === "same") return "front";
  return "blank";
}

function CardModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useArtTexture(aspect, backVariant(spec), art, label);
  const d = 0.025;
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.18, 0.28, 0]}>
      <group position={[0.28, -0.22, -0.32]} rotation={[0, Math.PI + 0.25, 0.1]}>
        <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} radius={Math.min(w, h) * 0.03} />
      </group>
      <group rotation-z={-0.06}>
        <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} radius={Math.min(w, h) * 0.03} />
        {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

function SheetModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useArtTexture(aspect, backVariant(spec), art, label);
  const d = 0.012;
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.12, 0.22, 0]}>
      {[2, 1].map((i) => (
        <group key={i} position={[i * 0.07, -i * 0.05, -i * 0.05]} rotation-z={i * 0.035}>
          <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} />
        </group>
      ))}
      <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} />
      {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
    </group>
  );
}

function StickerModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2);
  const aspect = artAspect(spec);
  const mask = spec.shape === "round" ? roundPath : spec.shape === "heart" ? heartPath : undefined;
  const front = useArtTexture(aspect, "front", art, label, mask);
  const [lw, lh] = sizeLabels(spec);
  const liner = useMemo(() => ({ ...spec, shape: "rect" as const, clearcoat: 0, finish: "matte" as const }), [spec]);
  const blank = useArtTexture(aspect, "blank", art, label);
  return (
    <group rotation={[-0.2, 0.25, 0]}>
      <group position-z={-0.02}>
        <Slab w={w * 1.14} h={h * 1.14} d={0.01} spec={liner} front={blank} radius={0.06} edgeColor="#ececec" backColor="#e9e2d0" />
      </group>
      <group position-z={0.008}>
        <Slab w={w * 1.04} h={h * 1.04} d={0.006} spec={{ ...spec, clearcoat: 0 }} front={blank} radius={Math.min(w, h) * 0.08} />
      </group>
      <group position-z={0.018} rotation={[0.04, -0.05, 0]}>
        <Slab w={w} h={h} d={0.008} spec={spec} front={front} radius={Math.min(w, h) * 0.07} />
      </group>
      {showDims && <Dimensions w={w * 1.14} h={h * 1.14} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}

function Standoffs({ w, h, z }: { w: number; h: number; z: number }) {
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

function PanelModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const d = Math.max(spec.depthCm * scale, 0.03);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.08, 0.3, 0]}>
      <Slab w={w} h={h} d={d} spec={spec} front={front} radius={0.02} edgeColor="#ffffff" />
      <Standoffs w={w} h={h} z={d / 2 + 0.03} />
      {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
    </group>
  );
}

function AcrylicModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const d = Math.max(spec.depthCm * scale * 2, 0.05);
  const shape = useMemo(() => makeShape("rect", w, h, 0.03), [w, h]);
  const glass = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 24 });
    g.translate(0, 0, -d / 2);
    return g;
  }, [shape, d]);
  const face = useMemo(() => faceGeometry(shape, w, h), [shape, w, h]);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.08, 0.32, 0]}>
      <mesh geometry={face} position-z={-d / 2 + 0.002}>
        <PrintMaterial map={front} spec={{ ...spec, clearcoat: 0 }} />
      </mesh>
      <mesh geometry={glass} castShadow>
        <meshPhysicalMaterial transmission={1} thickness={d} roughness={0.04} ior={1.49} color="#ffffff" clearcoat={1} clearcoatRoughness={0.02} />
      </mesh>
      <Standoffs w={w} h={h} z={d / 2 + 0.03} />
      {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
    </group>
  );
}

function NeonModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec);
  const neon = useArtTexture(artAspect(spec), "neon", art, label);
  const shape = useMemo(() => makeShape("rect", w, h, 0.05), [w, h]);
  const glass = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -0.02);
    return g;
  }, [shape]);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (light.current) light.current.intensity = 2.4 + Math.sin(clock.elapsedTime * 3) * 0.15;
  });
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.05, 0.25, 0]}>

      <mesh geometry={glass}>
        <meshPhysicalMaterial transmission={1} thickness={0.04} roughness={0.08} color="#ffffff" />
      </mesh>
      <mesh position-z={0.03}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={neon} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0, 0.6]} color="#ff6ad5" distance={4} />
      {showDims && <Dimensions w={w} h={h} z={0.05} labelW={lw} labelH={lh} light />}
    </group>
  );
}

function CanvasModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const d = Math.max(spec.depthCm * scale, 0.1);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.06, 0.35, 0]}>
      <Slab w={w} h={h} d={d} spec={{ ...spec, finish: "matte" }} front={front} edgeColor="#efe9dd" backColor="#cdb48a" />
      {showDims && <Dimensions w={w} h={h} z={d / 2} labelW={lw} labelH={lh} />}
    </group>
  );
}

function MatModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const mask = spec.shape === "round" ? roundPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-1.05, 0, 0.35]}>
      <Slab w={w} h={h} d={0.05} spec={{ ...spec, finish: "matte" }} front={front} radius={0.1} edgeColor="#1f1f1f" backColor="#141414" />
      {showDims && <Dimensions w={w} h={h} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}

function Tube({ length, radius = 0.028, color = "#f7f7f7", position }: { length: number; radius?: number; color?: string; position: [number, number, number] }) {
  return (
    <mesh position={position} rotation-z={Math.PI / 2} castShadow>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      <meshStandardMaterial color={color} roughness={0.4} />
    </mesh>
  );
}

function Cord({ points }: { points: THREE.Vector3[] }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.006, 8), [points]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
    </mesh>
  );
}

function BannerModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const [lw, lh] = sizeLabels(spec);
  const cord = useMemo(
    () => [new THREE.Vector3(-w / 2 - 0.02, h / 2 + 0.02, 0), new THREE.Vector3(0, h / 2 + 0.38, 0), new THREE.Vector3(w / 2 + 0.02, h / 2 + 0.02, 0)],
    [w, h],
  );
  return (
    <group rotation={[0, 0.3, 0]}>
      <Slab w={w} h={h} d={0.008} spec={spec} front={front} />
      {spec.grommets ? (
        [
          [-w / 2 + 0.06, h / 2 - 0.06],
          [w / 2 - 0.06, h / 2 - 0.06],
          [-w / 2 + 0.06, -h / 2 + 0.06],
          [w / 2 - 0.06, -h / 2 + 0.06],
        ].map(([x, y]) => (
          <mesh key={`${x}${y}`} position={[x, y, 0.006]}>
            <torusGeometry args={[0.025, 0.008, 12, 24]} />
            <meshStandardMaterial color="#c9c9c9" metalness={1} roughness={0.3} />
          </mesh>
        ))
      ) : (
        <>
          <Tube length={w * 1.08} position={[0, h / 2 + 0.01, 0]} />
          <Tube length={w * 1.08} position={[0, -h / 2 - 0.01, 0]} />
          <Cord points={cord} />
        </>
      )}
      {showDims && <Dimensions w={w} h={h} z={0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

function RollupModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.6);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[0, 0.35, 0]}>
      <RoundedBox args={[w * 1.06, 0.09, 0.22]} radius={0.03} position={[0, -h / 2 - 0.045, 0]} castShadow>
        <meshStandardMaterial color="#cfd2d6" metalness={0.9} roughness={0.3} />
      </RoundedBox>
      <Slab w={w} h={h} d={0.006} spec={spec} front={front} />
      <Tube length={w * 1.02} radius={0.018} color="#bfc3c8" position={[0, h / 2, 0]} />
      <mesh position={[0, 0, -0.06]}>
        <cylinderGeometry args={[0.012, 0.012, h, 12]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.9} roughness={0.3} />
      </mesh>
      {showDims && <Dimensions w={w} h={h} z={0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

function wave(geometry: THREE.BufferGeometry, w: number, h: number, t: number, strength: number, anchor: "left" | "top") {
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

function Waving({ w, h, texture, strength = 0.08, anchor = "left" }: { w: number; h: number; texture: THREE.Texture; strength?: number; anchor?: "left" | "top" }) {
  const geometry = useRef<THREE.PlaneGeometry>(null);
  useFrame(({ clock }) => {
    if (geometry.current) wave(geometry.current, w, h, clock.elapsedTime, strength, anchor);
  });
  return (
    <mesh castShadow>
      <planeGeometry ref={geometry} args={[w, h, 48, 48]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} transparent alphaTest={0.5} roughness={0.8} />
    </mesh>
  );
}

function FlagModel({ spec, art, label }: ModelProps) {
  const rect = spec.flagStyle === "rect";
  const target = 2.4;
  const scale = target / Math.max(spec.widthCm, spec.heightCm);
  const w = spec.widthCm * scale;
  const h = spec.heightCm * scale;
  const texture = useArtTexture(spec.widthCm / spec.heightCm, "front", art, label, rect ? undefined : featherPath);
  const poleH = rect ? h * 2.2 : h + 0.15;
  return (
    <group rotation-y={0.4}>
      <mesh position={[-w / 2 - 0.015, rect ? poleH / 2 - h * 0.6 : 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, poleH, 16]} />
        <meshStandardMaterial color="#4b4f55" metalness={0.8} roughness={0.35} />
      </mesh>
      <group position-y={rect ? poleH - h * 0.6 - h / 2 - 0.05 : 0}>
        <Waving w={w} h={h} texture={texture} strength={rect ? 0.12 : 0.06} />
      </group>
      {!rect && (
        <mesh position={[-w / 2 - 0.015, -h / 2 - 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.26, 0.08, 32]} />
          <meshStandardMaterial color="#2b2b2f" roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}

function ClothModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.3);
  const texture = useArtTexture(artAspect(spec), "front", art, label);
  return (
    <group rotation-y={0.3}>
      <Tube length={w * 1.15} radius={0.022} color="#b98b5a" position={[0, h / 2 + 0.02, 0]} />
      <Waving w={w} h={h} texture={texture} strength={0.05} anchor="top" />
    </group>
  );
}

function metalColor(metal: MockupSpec["metal"]) {
  if (metal === "gold") return "#e8c26a";
  if (metal === "rose") return "#e9a99b";
  return "#e2e4e7";
}

function MugModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(2.35, "front", art, label);
  const r = 0.62;
  const h = 1.5;
  const metal = spec.metal !== "none";
  return (
    <group rotation-y={Math.PI + 0.55}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, h, 96, 1, true]} />
        <meshPhysicalMaterial
          map={texture}
          color={metal ? metalColor(spec.metal) : spec.baseColor}
          metalness={metal ? 0.85 : 0}
          roughness={metal ? 0.18 : 0.12}
          clearcoat={metal ? 0.6 : 1}
          clearcoatRoughness={0.05}
        />
      </mesh>
      <mesh>
        <cylinderGeometry args={[r * 0.93, r * 0.93, h * 0.98, 96, 1, true]} />
        <meshStandardMaterial color={spec.innerColor} side={THREE.BackSide} roughness={0.15} />
      </mesh>
      <mesh position-y={h / 2} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[r * 0.93, r, 96]} />
        <meshStandardMaterial color={spec.innerColor === "#ffffff" ? "#ffffff" : spec.innerColor} roughness={0.15} />
      </mesh>
      <mesh position-y={-h / 2 + 0.06} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[r * 0.93, 64]} />
        <meshStandardMaterial color={spec.innerColor} roughness={0.2} />
      </mesh>
      <mesh position-y={-h / 2} rotation-x={Math.PI / 2}>
        <circleGeometry args={[r, 64]} />
        <meshStandardMaterial color="#f1f1f1" roughness={0.6} />
      </mesh>
      <group position={[0, 0.02, r - 0.02]} rotation-y={-Math.PI / 2}>
        <mesh rotation-z={-Math.PI / 2} castShadow>
          <torusGeometry args={[0.36, 0.075, 20, 48, Math.PI]} />
          <meshPhysicalMaterial color={spec.accentColor ?? (metal ? metalColor(spec.metal) : spec.baseColor)} metalness={metal ? 0.85 : 0} roughness={0.15} clearcoat={1} />
        </mesh>
      </group>
    </group>
  );
}

function TumblerModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(2.2, "front", art, label);
  const glass = /vidro|chopp/i.test(label);
  const bamboo = /bamb/i.test(label);
  return (
    <group rotation-y={Math.PI}>
      <mesh castShadow>
        <cylinderGeometry args={[0.6, 0.48, 2, 96, 1, true]} />
        {glass ? (
          <meshPhysicalMaterial map={texture} transmission={0.75} roughness={0.45} thickness={0.1} color="#ffffff" />
        ) : (
          <meshPhysicalMaterial map={texture} metalness={spec.metal !== "none" ? 0.6 : 0} roughness={0.25} clearcoat={0.6} />
        )}
      </mesh>
      <mesh position-y={-1} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.48, 48]} />
        <meshStandardMaterial color="#d9d9d9" />
      </mesh>
      <mesh position-y={1.06} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.14, 64]} />
        <meshStandardMaterial color={bamboo ? "#c9a46c" : "#2a2a2e"} roughness={0.6} />
      </mesh>
    </group>
  );
}

function BottleModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(2.2, "front", art, label);
  const profile = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0, -1.25));
    pts.push(new THREE.Vector2(0.5, -1.25));
    pts.push(new THREE.Vector2(0.55, -1.15));
    pts.push(new THREE.Vector2(0.55, 0.55));
    pts.push(new THREE.Vector2(0.5, 0.78));
    pts.push(new THREE.Vector2(0.32, 0.98));
    pts.push(new THREE.Vector2(0.24, 1.05));
    pts.push(new THREE.Vector2(0.24, 1.18));
    return pts;
  }, []);
  const metal = spec.metal !== "none" || !/pl[aá]stic/i.test(label);
  return (
    <group rotation-y={Math.PI}>
      <mesh castShadow>
        <latheGeometry args={[profile, 96]} />
        <meshPhysicalMaterial color={metal ? "#dfe2e6" : "#f5f5f5"} metalness={metal ? 0.9 : 0} roughness={metal ? 0.25 : 0.4} clearcoat={0.5} />
      </mesh>
      <mesh position-y={-0.3}>
        <cylinderGeometry args={[0.556, 0.556, 1.6, 96, 1, true]} />
        <meshPhysicalMaterial map={texture} roughness={0.3} clearcoat={0.6} transparent />
      </mesh>
      <mesh position-y={1.28} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.22, 48]} />
        <meshStandardMaterial color={/bamb/i.test(label) ? "#c9a46c" : "#1f1f22"} roughness={0.5} />
      </mesh>
      {/mosquet/i.test(label) && (
        <mesh position={[0, 1.52, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.16, 0.025, 12, 32]} />
          <meshStandardMaterial color="#e07b22" metalness={0.6} roughness={0.35} />
        </mesh>
      )}
    </group>
  );
}

function teeShape(sleeveless: boolean) {
  const s = new THREE.Shape();
  if (sleeveless) {
    s.moveTo(-0.3, 1.15);
    s.quadraticCurveTo(0, 0.88, 0.3, 1.15);
    s.lineTo(0.44, 1.14);
    s.quadraticCurveTo(0.46, 0.55, 0.68, 0.4);
    s.lineTo(0.7, -1.15);
    s.quadraticCurveTo(0, -1.2, -0.7, -1.15);
    s.lineTo(-0.68, 0.4);
    s.quadraticCurveTo(-0.46, 0.55, -0.44, 1.14);
    s.closePath();
    return s;
  }
  s.moveTo(-0.28, 1.15);
  s.quadraticCurveTo(0, 0.9, 0.28, 1.15);
  s.lineTo(0.62, 1.05);
  s.lineTo(1.1, 0.6);
  s.lineTo(0.88, 0.34);
  s.lineTo(0.64, 0.52);
  s.lineTo(0.66, -1.15);
  s.quadraticCurveTo(0, -1.2, -0.66, -1.15);
  s.lineTo(-0.64, 0.52);
  s.lineTo(-0.88, 0.34);
  s.lineTo(-1.1, 0.6);
  s.lineTo(-0.62, 1.05);
  s.closePath();
  return s;
}

function TshirtModel({ spec, art, label }: ModelProps) {
  const printArt = useMemo(() => ({ ...art, background: art.src ? "rgba(0,0,0,0)" : art.background }), [art]);
  const texture = useArtTexture(0.78, "front", printArt, label);
  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(teeShape(spec.sleeveless), {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.04,
      bevelSegments: 8,
      curveSegments: 24,
    });
    g.translate(0, 0, -0.025);
    return g;
  }, [spec.sleeveless]);
  return (
    <group rotation-y={0.25}>
      <mesh geometry={geometry} castShadow>
        <meshPhysicalMaterial color={spec.baseColor} roughness={0.95} sheen={1} sheenRoughness={0.8} sheenColor="#ffffff" />
      </mesh>
      <mesh position={[0, 0.22, 0.087]}>
        <planeGeometry args={[0.8, 0.8 / 0.78]} />
        <meshStandardMaterial map={texture} transparent roughness={0.85} />
      </mesh>
    </group>
  );
}

function CapModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(1.6, "front", art, label);
  return (
    <group rotation-y={0.5} position-y={-0.2}>
      <mesh scale={[1, 0.82, 1]} castShadow>
        <sphereGeometry args={[0.9, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color={spec.baseColor} roughness={0.95} sheen={1} sheenColor="#ffffff" />
      </mesh>
      <mesh scale={[1.002, 0.822, 1.002]}>
        <sphereGeometry args={[0.9, 64, 32, Math.PI / 2 - 0.75, 1.5, 0.45, 0.85]} />
        <meshStandardMaterial map={texture} transparent roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.01, 0.35]} rotation-x={0.12} castShadow>
        <cylinderGeometry args={[0.8, 0.8, 0.03, 48, 1, false, -Math.PI / 2, Math.PI]} />
        <meshPhysicalMaterial color={spec.baseColor} roughness={0.9} />
      </mesh>
      <mesh position-y={0.74}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={spec.baseColor} roughness={0.9} />
      </mesh>
    </group>
  );
}

function pillowGeometry(w: number, h: number, thickness: number, shape: MockupSpec["shape"]) {
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

function CushionModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const mask = spec.shape === "round" ? roundPath : spec.shape === "heart" ? heartPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const back = useArtTexture(artAspect(spec), spec.back === "same" ? "front" : "blank", art, label, mask);
  const thick = Math.min(w, h) * 0.32;
  const geometry = useMemo(() => pillowGeometry(w, h, thick, spec.shape === "heart" ? "round" : spec.shape), [w, h, thick, spec.shape]);
  const transparent = spec.shape !== "rect";
  return (
    <group rotation={[-0.15, 0.4, 0]}>
      <mesh geometry={geometry} castShadow>
        <meshPhysicalMaterial map={front} roughness={0.9} sheen={0.25} sheenColor="#d9d9d9" transparent={transparent} alphaTest={transparent ? 0.5 : 0} />
      </mesh>
      <mesh geometry={geometry} rotation-y={Math.PI}>
        <meshPhysicalMaterial map={back} roughness={0.9} sheen={0.25} sheenColor="#d9d9d9" transparent={transparent} alphaTest={transparent ? 0.5 : 0} />
      </mesh>
    </group>
  );
}

function Spiral({ length, axis, offset, count = 14 }: { length: number; axis: "x" | "y"; offset: [number, number, number]; count?: number }) {
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

function BookModel({ spec, art, label }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.1);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const thick = Math.max(spec.depthCm * scale, 0.14);
  const spiral = /agenda|caderno|planner/i.test(label);
  return (
    <group rotation={[-0.3, 0.55, 0]}>
      <group position-z={thick / 2}>
        <Slab w={w} h={h} d={0.03} spec={spec} front={front} radius={0.02} edgeColor="#2b2b2f" backColor="#2b2b2f" />
      </group>
      <group position-z={-thick / 2}>
        <Slab w={w} h={h} d={0.03} spec={spec} front={front} radius={0.02} edgeColor="#2b2b2f" backColor="#2b2b2f" />
      </group>
      <mesh>
        <boxGeometry args={[w * 0.97, h * 0.97, thick - 0.03]} />
        <meshStandardMaterial color="#fbfaf6" roughness={0.95} />
      </mesh>
      {spiral ? (
        <Spiral length={h} axis="y" offset={[-w / 2 + 0.06, 0, 0]} />
      ) : (
        <mesh position-x={-w / 2}>
          <boxGeometry args={[0.04, h, thick + 0.03]} />
          <meshStandardMaterial color="#2b2b2f" roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}

function TentModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const back = useArtTexture(artAspect(spec), "gray", art, label);
  const tilt = 0.3;
  return (
    <group rotation-y={0.45}>
      <group position={[0, 0, Math.sin(tilt) * h * 0.5]} rotation-x={-tilt}>
        <Slab w={w} h={h} d={0.01} spec={spec} front={front} />
      </group>
      <group position={[0, 0, -Math.sin(tilt) * h * 0.5]} rotation-x={tilt}>
        <Slab w={w} h={h} d={0.01} spec={spec} front={back} />
      </group>
      <Spiral length={w} axis="x" offset={[0, h / 2 * Math.cos(tilt), 0]} count={18} />
    </group>
  );
}

function BagModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.1);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const depth = w * 0.25;
  const handle = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-w * 0.22, 0, 0),
      new THREE.Vector3(-w * 0.18, h * 0.32, 0),
      new THREE.Vector3(w * 0.18, h * 0.32, 0),
      new THREE.Vector3(w * 0.22, 0, 0),
    ]);
    return new THREE.TubeGeometry(curve, 48, 0.025, 10);
  }, [w, h]);
  const fabric = spec.baseColor === "#ffffff" ? "#f2ede2" : spec.baseColor;
  return (
    <group rotation-y={0.45}>
      <mesh castShadow>
        <boxGeometry args={[w, h, depth]} />
        <meshPhysicalMaterial attach="material-0" color={fabric} roughness={0.95} sheen={1} />
        <meshPhysicalMaterial attach="material-1" color={fabric} roughness={0.95} sheen={1} />
        <meshStandardMaterial attach="material-2" color="#d8d2c4" roughness={1} />
        <meshPhysicalMaterial attach="material-3" color={fabric} roughness={0.95} />
        <meshPhysicalMaterial attach="material-4" map={front} roughness={0.9} sheen={1} />
        <meshPhysicalMaterial attach="material-5" color={fabric} roughness={0.95} sheen={1} />
      </mesh>
      <mesh geometry={handle} position={[0, h / 2, depth / 2 - 0.02]}>
        <meshStandardMaterial color={fabric} roughness={0.95} />
      </mesh>
      <mesh geometry={handle} position={[0, h / 2, -depth / 2 + 0.02]}>
        <meshStandardMaterial color={fabric} roughness={0.95} />
      </mesh>
    </group>
  );
}

function BoxModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const top = useArtTexture(1, "front", art, label);
  const depth = Math.min(w, h) * 0.8;
  const clear = /acr[ií]lic/i.test(label);
  return (
    <group rotation={[-0.25, 0.6, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w, h, depth]} />
        {clear ? (
          <meshPhysicalMaterial transmission={1} roughness={0.05} thickness={0.05} />
        ) : (
          <>
            <meshStandardMaterial attach="material-0" color="#f6f6f6" roughness={0.8} />
            <meshStandardMaterial attach="material-1" color="#f6f6f6" roughness={0.8} />
            <meshPhysicalMaterial attach="material-2" map={top} roughness={roughnessOf(spec)} clearcoat={spec.clearcoat} />
            <meshStandardMaterial attach="material-3" color="#efefef" roughness={0.8} />
            <meshPhysicalMaterial attach="material-4" map={front} roughness={roughnessOf(spec)} clearcoat={spec.clearcoat} />
            <meshStandardMaterial attach="material-5" color="#f6f6f6" roughness={0.8} />
          </>
        )}
      </mesh>
      {clear && (
        <mesh position-z={depth / 2 + 0.002}>
          <planeGeometry args={[w * 0.9, h * 0.9]} />
          <meshStandardMaterial map={front} />
        </mesh>
      )}
    </group>
  );
}

export function MockupModel(props: ModelProps) {
  switch (props.spec.kind) {
    case "card":
      return <CardModel {...props} />;
    case "sticker":
      return <StickerModel {...props} />;
    case "panel":
      return <PanelModel {...props} />;
    case "acrylic":
    case "keychain":
      return <AcrylicModel {...props} />;
    case "neon":
      return <NeonModel {...props} />;
    case "canvas":
      return <CanvasModel {...props} />;
    case "mat":
    case "rug":
    case "coaster":
    case "board":
      return <MatModel {...props} />;
    case "banner":
    case "lightbox":
      return <BannerModel {...props} />;
    case "rollup":
      return <RollupModel {...props} />;
    case "flag":
    case "hardware":
      return <FlagModel {...props} />;
    case "cloth":
    case "apron":
    case "bandana":
      return <ClothModel {...props} />;
    case "mug":
      return <MugModel {...props} />;
    case "tumbler":
      return <TumblerModel {...props} />;
    case "bottle":
      return <BottleModel {...props} />;
    case "tshirt":
      return <TshirtModel {...props} />;
    case "cap":
      return <CapModel {...props} />;
    case "cushion":
    case "petbed":
      return <CushionModel {...props} />;
    case "book":
      return <BookModel {...props} />;
    case "tent":
      return <TentModel {...props} />;
    case "bag":
      return <BagModel {...props} />;
    case "box":
      return <BoxModel {...props} />;
    default:
      return <SheetModel {...props} />;
  }
}
