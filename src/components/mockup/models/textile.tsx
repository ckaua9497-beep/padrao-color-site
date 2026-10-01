"use client";

import { useEffect, useMemo } from "react";
import { Decal } from "@react-three/drei";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { inflatedSurface, shapePolygon } from "./inflate";
import { Tube, Waving, fitFlat, makeShape, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

/*
 * Têxteis procedurais. A forma vem de um contorno 2D inflado (inflate.ts); a estampa entra por
 * Decal nas peças em que ela ocupa só uma área (camiseta, boné, avental, sacola) e pelo UV nas
 * sublimadas de ponta a ponta (almofada, cama pet, bandana).
 */

function Fabric({ color, sheen = 1 }: { color: string; sheen?: number }) {
  return <meshPhysicalMaterial color={color} roughness={0.92} sheen={sheen} sheenRoughness={0.8} sheenColor="#ffffff" />;
}

/** Estampa projetada sobre a malha-mãe (não aparece pelas costas: depthTest ligado). */
function Print({ map, position, size, rotation }: { map: THREE.Texture; position: [number, number, number]; size: [number, number]; rotation?: [number, number, number] }) {
  return (
    <Decal position={position} rotation={rotation} scale={[size[0], size[1], 0.5]} depthTest>
      <meshStandardMaterial map={map} transparent alphaTest={0.02} roughness={0.85} polygonOffset polygonOffsetFactor={-10} depthTest />
    </Decal>
  );
}

/** Arte de vestuário e sacola: imagem enviada sem fundo (o tecido aparece ao redor). */
function useApparelArt(art: ModelProps["art"]) {
  return useMemo(() => ({ ...art, background: art.src ? "rgba(0,0,0,0)" : art.background }), [art]);
}

function useGeometriesCleanup(list: THREE.BufferGeometry[]) {
  useEffect(() => () => list.forEach((g) => g.dispose()), [list]);
}

function useInflated(shape: THREE.Shape | null, height: number, options: { falloff?: number; folds?: number; resolution?: number } = {}) {
  const { falloff, folds = 0, resolution = 90 } = options;
  const surfaces = useMemo(() => {
    if (!shape) return null;
    const polygon = shapePolygon(shape);
    return {
      polygon,
      front: inflatedSurface(polygon, { height, falloff, folds, resolution, side: 1 }),
      back: inflatedSurface(polygon, { height, falloff, folds, resolution, side: -1 }),
    };
  }, [shape, height, falloff, folds, resolution]);
  useGeometryCleanup(surfaces?.front);
  useGeometryCleanup(surfaces?.back);
  return surfaces;
}

function closedTube(polygon: THREE.Vector2[], radius: number, z = 0) {
  const curve = new THREE.CatmullRomCurve3(
    polygon.map((p) => new THREE.Vector3(p.x, p.y, z)),
    true,
  );
  return new THREE.TubeGeometry(curve, Math.max(64, polygon.length), radius, 10, true);
}

// ---------------------------------------------------------------------------- camiseta

/** Unidades por centímetro numa camiseta tamanho M (≈ 72 cm de comprimento). */
const SHIRT_UNIT = 2.32 / 72;

function shirtShape(sleeves: "short" | "long" | "none", width = 1) {
  const s = new THREE.Shape();
  const top = 1.12;
  const neckW = 0.25;
  const hemW = 0.66 * width;
  s.moveTo(-neckW, top);
  s.quadraticCurveTo(0, top - 0.26, neckW, top);
  if (sleeves === "none") {
    s.lineTo(neckW + 0.13, top - 0.01);
    s.bezierCurveTo(hemW * 0.62, top - 0.25, hemW * 0.74, 0.56, hemW, 0.42);
  } else if (sleeves === "short") {
    s.lineTo(0.6 * width, top - 0.08);
    s.lineTo(1.08 * width, 0.66);
    s.quadraticCurveTo(1.11 * width, 0.5, 1.0 * width, 0.44);
    s.lineTo(0.86 * width, 0.36);
    s.quadraticCurveTo(0.7 * width, 0.42, 0.63 * width, 0.5);
  } else {
    s.lineTo(0.6 * width, top - 0.08);
    s.lineTo(1.24 * width, -0.55);
    s.lineTo(1.05 * width, -0.66);
    s.lineTo(0.64 * width, 0.4);
  }
  s.lineTo(hemW, -1.1);
  s.quadraticCurveTo(hemW, -1.16, hemW - 0.06, -1.16);
  s.lineTo(-hemW + 0.06, -1.16);
  s.quadraticCurveTo(-hemW, -1.16, -hemW, -1.1);
  if (sleeves === "none") {
    s.lineTo(-hemW, 0.42);
    s.bezierCurveTo(-hemW * 0.74, 0.56, -hemW * 0.62, top - 0.25, -(neckW + 0.13), top - 0.01);
  } else if (sleeves === "short") {
    s.lineTo(-0.63 * width, 0.5);
    s.quadraticCurveTo(-0.7 * width, 0.42, -0.86 * width, 0.36);
    s.lineTo(-1.0 * width, 0.44);
    s.quadraticCurveTo(-1.11 * width, 0.5, -1.08 * width, 0.66);
    s.lineTo(-0.6 * width, top - 0.08);
  } else {
    s.lineTo(-0.64 * width, 0.4);
    s.lineTo(-1.05 * width, -0.66);
    s.lineTo(-1.24 * width, -0.55);
    s.lineTo(-0.6 * width, top - 0.08);
  }
  s.closePath();
  return s;
}

export function TshirtModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const aspect = artAspect(spec);
  const texture = useArtTexture(aspect, "front", printArt, label);
  const sleeves = spec.sleeveless ? "none" : spec.longSleeve ? "long" : "short";
  const shape = useMemo(() => shirtShape(sleeves), [sleeves]);
  const surfaces = useInflated(shape, 0.09, { falloff: 0.14, folds: 0.006 });
  const collar = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.25, 1.12, 0), new THREE.Vector3(0, 0.86, 0), new THREE.Vector3(0.25, 1.12, 0));
    return new THREE.TubeGeometry(curve, 48, 0.032, 10, false);
  }, []);
  useGeometryCleanup(collar);

  const printW = spec.widthCm * SHIRT_UNIT;
  const printH = spec.heightCm * SHIRT_UNIT;
  const printY = 0.74 - printH / 2;
  const fabric = spec.baseColor;
  const rib = new THREE.Color(fabric).multiplyScalar(0.9).getStyle();

  if (!surfaces) return null;
  return (
    <group rotation-y={0.18}>
      <mesh geometry={surfaces.front}>
        <Fabric color={fabric} />
        <Print key={sleeves} map={texture} position={[0, printY, 0.1]} rotation={[0, 0, 0]} size={[printW, printH]} />
      </mesh>
      <mesh geometry={surfaces.back}>
        <Fabric color={fabric} />
      </mesh>
      <mesh geometry={collar}>
        <meshStandardMaterial color={rib} roughness={0.95} />
      </mesh>
      {spec.collar === "polo" && <PoloCollar color={fabric} />}
    </group>
  );
}

function PoloCollar({ color }: { color: string }) {
  const flap = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.3, 0.02);
    s.lineTo(0.2, -0.22);
    s.lineTo(0.02, -0.12);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  }, []);
  useGeometryCleanup(flap);
  return (
    <group>
      <mesh geometry={flap} position={[0.02, 1.13, 0.06]} rotation-z={-0.08}>
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh geometry={flap} position={[-0.02, 1.13, 0.06]} rotation-y={Math.PI} rotation-z={-0.08}>
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.78, 0.075]}>
        <boxGeometry args={[0.1, 0.36, 0.012]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {[0.88, 0.7].map((y) => (
        <mesh key={y} position={[0, y, 0.085]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.022, 0.022, 0.012, 16]} />
          <meshStandardMaterial color="#e9e6df" roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------- boné

const CAP_RADIUS = 0.9;
/** Unidades por centímetro: a copa tem ≈ 9 cm de raio. */
const CAP_UNIT = CAP_RADIUS / 9;

export function CapModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const texture = useArtTexture(artAspect(spec), "front", printArt, label);
  const crown = useMemo(() => new THREE.SphereGeometry(CAP_RADIUS, 72, 36, 0, Math.PI * 2, 0, Math.PI / 2), []);
  const seams = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const points = Array.from({ length: 24 }, (_, k) => {
          const theta = (k / 23) * (Math.PI / 2);
          const r = CAP_RADIUS * 1.003;
          return new THREE.Vector3(Math.sin(theta) * Math.sin(angle) * r, Math.cos(theta) * r, Math.sin(theta) * Math.cos(angle) * r);
        });
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.008, 6, false);
      }),
    [],
  );
  const visor = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.82, 0);
    s.quadraticCurveTo(-0.7, 0.62, 0, 0.72);
    s.quadraticCurveTo(0.7, 0.62, 0.82, 0);
    s.quadraticCurveTo(0, 0.18, -0.82, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 });
    // Deita a aba e curva as laterais para baixo, como uma aba pré-curvada.
    g.rotateX(Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      pos.setY(i, pos.getY(i) - 0.32 * x * x);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useGeometryCleanup(crown);
  useGeometryCleanup(visor);
  useGeometriesCleanup(seams);

  const printW = spec.widthCm * CAP_UNIT;
  const printH = spec.heightCm * CAP_UNIT;
  const seamColor = new THREE.Color(spec.baseColor).multiplyScalar(0.82).getStyle();

  return (
    <group rotation-y={0.5}>
      <group scale={[1, 0.78, 1.06]}>
        <mesh geometry={crown}>
          <Fabric color={spec.baseColor} />
          <Print map={texture} position={[0, CAP_RADIUS * 0.42, CAP_RADIUS * 0.9]} size={[printW, printH / 0.78]} />
        </mesh>
        <mesh geometry={crown}>
          <meshStandardMaterial color="#2a2a2a" side={THREE.BackSide} roughness={1} />
        </mesh>
        {seams.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color={seamColor} roughness={0.9} />
          </mesh>
        ))}
        <mesh position-y={CAP_RADIUS}>
          <sphereGeometry args={[0.055, 16, 12]} />
          <meshStandardMaterial color={spec.baseColor} roughness={0.9} />
        </mesh>
      </group>
      <mesh geometry={visor} position={[0, 0.02, CAP_RADIUS * 0.84]} rotation-x={0.08}>
        <Fabric color={spec.baseColor} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- almofada e cama pet

export function CushionModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const back = useArtTexture(artAspect(spec), spec.back === "same" ? "front" : "blank", art, label);
  const shape = useMemo(() => makeShape(spec.shape, w, h, Math.min(w, h) * 0.14), [spec.shape, w, h]);
  const thick = Math.min(w, h) * 0.16;
  const surfaces = useInflated(shape, thick, { falloff: Math.min(w, h) * 0.32, folds: 0.004 });
  const piping = useMemo(() => (surfaces ? closedTube(surfaces.polygon, 0.022) : null), [surfaces]);
  useGeometryCleanup(piping);
  if (!surfaces) return null;
  return (
    <group rotation={[-0.15, 0.4, 0]}>
      <mesh geometry={surfaces.front}>
        <meshPhysicalMaterial map={front} roughness={0.9} sheen={0.3} sheenColor="#d9d9d9" />
      </mesh>
      <mesh geometry={surfaces.back}>
        <meshPhysicalMaterial map={back} roughness={0.9} sheen={0.3} sheenColor="#d9d9d9" />
      </mesh>
      {piping && (
        <mesh geometry={piping}>
          <meshStandardMaterial color="#efefef" roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

export function PetBedModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const round = spec.shape === "round";
  const rim = 0.2;
  const outline = useMemo(() => makeShape(round ? "round" : "rect", w - rim * 2, h - rim * 2, Math.min(w, h) * 0.18), [round, w, h]);
  const surfaces = useInflated(outline, 0.1, { falloff: 0.25, folds: 0.004 });
  const bolster = useMemo(() => (surfaces ? closedTube(surfaces.polygon, rim, 0) : null), [surfaces]);
  useGeometryCleanup(bolster);
  const fabric = spec.baseColor === "#ffffff" ? "#3b3b40" : spec.baseColor;
  if (!surfaces) return null;
  return (
    <group rotation={[-1.05, 0, 0.3]}>
      <mesh geometry={surfaces.front} position-z={0.02}>
        <meshPhysicalMaterial map={front} roughness={0.9} sheen={0.3} sheenColor="#d9d9d9" />
      </mesh>
      <mesh geometry={surfaces.back} position-z={0.02}>
        <Fabric color={fabric} />
      </mesh>
      {bolster && (
        <mesh geometry={bolster} position-z={0.08} scale={[1, 1, 0.9]}>
          <Fabric color={fabric} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------- flat-lay: bandana e avental

export function BandanaModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(artAspect(spec), "front", art, label);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-1.18, 0.62);
    s.quadraticCurveTo(-1.26, 0.7, -1.12, 0.72);
    s.lineTo(1.12, 0.72);
    s.quadraticCurveTo(1.26, 0.7, 1.18, 0.62);
    s.lineTo(0.08, -0.86);
    s.quadraticCurveTo(0, -0.95, -0.08, -0.86);
    s.closePath();
    return s;
  }, []);
  const surfaces = useInflated(shape, 0.03, { falloff: 0.08, folds: 0.022 });
  if (!surfaces) return null;
  return (
    <group rotation={[-0.95, 0, 0.2]}>
      <mesh geometry={surfaces.front}>
        <meshPhysicalMaterial map={texture} roughness={0.92} sheen={0.4} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={surfaces.back}>
        <Fabric color={spec.baseColor} />
      </mesh>
    </group>
  );
}

/** Unidades por centímetro num avental de ≈ 75 cm. */
const APRON_UNIT = 2.3 / 75;

export function ApronModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const texture = useArtTexture(artAspect(spec), "front", printArt, label);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.42, 1.1);
    s.lineTo(0.42, 1.1);
    s.lineTo(0.44, 0.62);
    s.quadraticCurveTo(0.5, 0.36, 0.78, 0.26);
    s.lineTo(0.8, -1.06);
    s.quadraticCurveTo(0.8, -1.14, 0.72, -1.14);
    s.lineTo(-0.72, -1.14);
    s.quadraticCurveTo(-0.8, -1.14, -0.8, -1.06);
    s.lineTo(-0.78, 0.26);
    s.quadraticCurveTo(-0.5, 0.36, -0.44, 0.62);
    s.closePath();
    return s;
  }, []);
  const surfaces = useInflated(shape, 0.035, { falloff: 0.08, folds: 0.012 });
  const straps = useMemo(() => {
    const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.38, 1.08, 0.01), new THREE.Vector3(-0.3, 1.5, 0), new THREE.Vector3(0, 1.66, 0), new THREE.Vector3(0.3, 1.5, 0), new THREE.Vector3(0.38, 1.08, 0.01)]);
    const ties = [-1, 1].map(
      (sign) => new THREE.CatmullRomCurve3([new THREE.Vector3(sign * 0.78, 0.24, 0), new THREE.Vector3(sign * 1.02, 0.1, 0.02), new THREE.Vector3(sign * 1.08, -0.3, 0), new THREE.Vector3(sign * 1.0, -0.62, 0.01)]),
    );
    return [neck, ...ties].map((curve) => new THREE.TubeGeometry(curve, 48, 0.022, 8, false));
  }, []);
  useGeometriesCleanup(straps);
  const printW = Math.min(1.1, spec.widthCm * APRON_UNIT);
  const printH = Math.min(1.3, spec.heightCm * APRON_UNIT);
  if (!surfaces) return null;
  return (
    <group rotation-y={0.2}>
      <mesh geometry={surfaces.front}>
        <Fabric color={spec.baseColor} sheen={0.6} />
        <Print map={texture} position={[0, 0.7 - printH / 2, 0.05]} rotation={[0, 0, 0]} size={[printW, printH]} />
      </mesh>
      <mesh geometry={surfaces.back}>
        <Fabric color={spec.baseColor} sheen={0.6} />
      </mesh>
      {straps.map((g, i) => (
        <mesh key={i} geometry={g}>
          <Fabric color={spec.baseColor} sheen={0.6} />
        </mesh>
      ))}
      <mesh position={[0, -0.6, 0.045]}>
        <boxGeometry args={[0.9, 0.42, 0.012]} />
        <Fabric color={spec.baseColor} sheen={0.6} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- pano pendurado e bolsas

export function ClothModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.3);
  const texture = useArtTexture(artAspect(spec), "front", art, label);
  return (
    <group rotation-y={0.3}>
      <Tube length={w * 1.15} radius={0.022} color="#b98b5a" position={[0, h / 2 + 0.02, 0]} />
      <Waving w={w} h={h} texture={texture} strength={0.05} anchor="top" />
    </group>
  );
}

export function BagModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const aspect = artAspect(spec);
  const texture = useArtTexture(aspect, "front", printArt, label);
  const pouch = spec.pouch;
  const [w, h] = pouch ? [2.1, 1.25] : [1.75, 1.95];
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const top = h / 2;
    const bottom = -h / 2;
    const r = pouch ? 0.22 : 0.06;
    const topW = pouch ? w / 2 : w / 2 - 0.04;
    s.moveTo(-topW, top);
    s.lineTo(topW, top);
    s.lineTo(w / 2, bottom + r);
    s.quadraticCurveTo(w / 2, bottom, w / 2 - r, bottom);
    s.lineTo(-w / 2 + r, bottom);
    s.quadraticCurveTo(-w / 2, bottom, -w / 2, bottom + r);
    s.closePath();
    return s;
  }, [w, h, pouch]);
  const surfaces = useInflated(shape, pouch ? 0.24 : 0.1, { falloff: pouch ? 0.4 : 0.18, folds: pouch ? 0.006 : 0.012 });
  const extras = useMemo(() => {
    if (pouch) {
      const zipper = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-w / 2 + 0.02, h / 2, 0), new THREE.Vector3(w / 2 - 0.02, h / 2, 0)), 8, 0.03, 8, false);
      return [zipper];
    }
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.36, h / 2 - 0.02, 0),
      new THREE.Vector3(-0.32, h / 2 + 0.5, 0),
      new THREE.Vector3(0, h / 2 + 0.72, 0),
      new THREE.Vector3(0.32, h / 2 + 0.5, 0),
      new THREE.Vector3(0.36, h / 2 - 0.02, 0),
    ]);
    return [new THREE.TubeGeometry(curve, 48, 0.04, 8, false)];
  }, [pouch, w, h]);
  useGeometriesCleanup(extras);
  const fabric = spec.baseColor === "#ffffff" && !pouch ? "#f2ede2" : spec.baseColor;
  const printH = Math.min(h * 0.62, (w * 0.62) / aspect);
  if (!surfaces) return null;
  return (
    <group rotation-y={0.45}>
      <mesh geometry={surfaces.front}>
        <Fabric color={fabric} />
        <Print map={texture} position={[0, pouch ? -0.04 : -0.08, 0.2]} rotation={[0, 0, 0]} size={[printH * aspect, printH]} />
      </mesh>
      <mesh geometry={surfaces.back}>
        <Fabric color={fabric} />
      </mesh>
      {pouch ? (
        <>
          <mesh geometry={extras[0]}>
            <meshStandardMaterial color="#2a2a2e" roughness={0.6} />
          </mesh>
          <mesh position={[w / 2 - 0.22, h / 2 - 0.08, 0.05]}>
            <boxGeometry args={[0.06, 0.16, 0.02]} />
            <meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.3} />
          </mesh>
        </>
      ) : (
        [0.035, -0.035].map((z) => (
          <mesh key={z} geometry={extras[0]} position-z={z} scale={[1, 1, 0.4]}>
            <Fabric color={fabric} />
          </mesh>
        ))
      )}
    </group>
  );
}
