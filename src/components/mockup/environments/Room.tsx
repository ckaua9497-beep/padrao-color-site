"use client";

// Sala procedural: paredes com reboco, piso, rodapé, janela com luz do dia (ou noite, no neon),
// móveis em escala real, oclusão assada nos cantos e as luzes fixas da sala. Tudo em metros: o
// viewer escala e posiciona o grupo para a peça ficar no lugar (placement.ts).

import { memo, useEffect, useMemo } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { useGeometryCleanup } from "../models/shared";
import {
  Armchair,
  Bed,
  Bench,
  Bookcase,
  Books,
  Counter,
  DecorRug,
  Desk,
  DeskLamp,
  DiningChair,
  DiningTable,
  FloatingShelf,
  FloorLamp,
  KitchenRun,
  Laptop,
  NightContext,
  Nightstand,
  OfficeChair,
  Pendant,
  Plant,
  SideTable,
  Sideboard,
  Sofa,
  TableLamp,
  TexturesContext,
  ThrowPillow,
  Vanity,
  WallArt,
} from "./furniture";
import { meterPlane } from "./geometry";
import {
  BED,
  COUNTER,
  DESK,
  NIGHTSTAND,
  ROOM_CONTACT,
  ROOM_DROP,
  ROOM_SHELF,
  SIDEBOARD,
  SIDE_TABLE,
  SOFA,
  SOFA_BACKREST,
  roomLayout,
  type RoomLayout,
  type WindowSpec,
} from "./layout";
import type { RoomEnvironment } from "./presets";
import { disposeRoomTextures, makeRoomTextures, type RoomTextures } from "./textures";

type V3 = [number, number, number];

function WallMaterial({ color, plaster }: { color: string; plaster: THREE.Texture }) {
  return <meshStandardMaterial color={color} roughness={0.94} bumpMap={plaster} bumpScale={0.35} />;
}

/** Faixa de oclusão (escura no lado +y do plano, some no outro). */
function Fade({ size, position, rotation, opacity, map }: { size: [number, number]; position: V3; rotation?: V3; opacity: number; map: THREE.Texture }) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={1}>
      <planeGeometry args={size} />
      <meshBasicMaterial color="#000000" alphaMap={map} transparent opacity={opacity} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

function Shell({ layout, env, textures }: { layout: RoomLayout; env: RoomEnvironment; textures: RoomTextures }) {
  const { width: W, height: H, depth: D } = layout;
  const palette = env.preset.palette;
  const wall = env.night ? palette.nightWall : palette.wall;
  const trim = env.night ? "#2a2b30" : palette.trim;
  const ceiling = env.night ? "#2a2b30" : "#f5f3ef";
  const parts = useMemo(
    () => ({
      back: meterPlane(W, H, 1.7),
      side: meterPlane(D, H, 1.7),
      floor: meterPlane(W, D, textures.floorTile),
      wainscot: layout.room === "bathroom" ? meterPlane(W, 1.25, 0.6) : null,
      wainscotSide: layout.room === "bathroom" ? meterPlane(3, 1.25, 0.6) : null,
    }),
    [W, H, D, textures.floorTile, layout.room],
  );
  useGeometryCleanup(parts.back);
  useGeometryCleanup(parts.side);
  useGeometryCleanup(parts.floor);
  useGeometryCleanup(parts.wainscot);
  useGeometryCleanup(parts.wainscotSide);
  const floorRough = palette.floor === "concrete" ? 0.42 : palette.floor === "tile" ? 0.32 : 0.55;
  const base = 0.1;
  const baseD = 0.016;
  const { fade, plaster } = textures;
  return (
    <group>
      <mesh geometry={parts.back} position={[0, H / 2, 0]}>
        <WallMaterial color={wall} plaster={plaster} />
      </mesh>
      <mesh geometry={parts.side} position={[-W / 2, H / 2, D / 2]} rotation-y={Math.PI / 2}>
        <WallMaterial color={wall} plaster={plaster} />
      </mesh>
      <mesh geometry={parts.side} position={[W / 2, H / 2, D / 2]} rotation-y={-Math.PI / 2}>
        <WallMaterial color={wall} plaster={plaster} />
      </mesh>
      <mesh geometry={parts.floor} position={[0, 0, D / 2]} rotation-x={-Math.PI / 2}>
        <meshStandardMaterial map={textures.floor} roughness={floorRough} />
      </mesh>
      <mesh position={[0, H, D / 2]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={ceiling} roughness={1} />
      </mesh>
      {parts.wainscot && parts.wainscotSide && textures.wallTile && (
        <>
          <mesh geometry={parts.wainscot} position={[0, 0.625, 0.004]}>
            <meshStandardMaterial map={textures.wallTile} roughness={0.25} />
          </mesh>
          <mesh geometry={parts.wainscotSide} position={[-W / 2 + 0.004, 0.625, 1.5]} rotation-y={Math.PI / 2}>
            <meshStandardMaterial map={textures.wallTile} roughness={0.25} />
          </mesh>
          <mesh position={[0, 1.255, 0.008]}>
            <boxGeometry args={[W, 0.012, 0.016]} />
            <meshStandardMaterial color="#d9d4cb" roughness={0.4} />
          </mesh>
        </>
      )}
      {/* Rodapé nas três paredes. */}
      {layout.room !== "bathroom" && (
        <>
          <mesh position={[0, base / 2, baseD / 2]}>
            <boxGeometry args={[W, base, baseD]} />
            <meshStandardMaterial color={trim} roughness={0.5} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (W / 2 - baseD / 2), base / 2, D / 2]}>
              <boxGeometry args={[baseD, base, D]} />
              <meshStandardMaterial color={trim} roughness={0.5} />
            </mesh>
          ))}
        </>
      )}
      {/* Oclusão assada: chão junto às paredes, cantos verticais e teto. */}
      <Fade map={fade} size={[W, 0.5]} position={[0, 0.0015, 0.25]} rotation={[-Math.PI / 2, 0, 0]} opacity={0.3} />
      {[-1, 1].map((side) => (
        <group key={`floor${side}`} position={[side * (W / 2), 0.0015, D / 2]} rotation-y={-side * (Math.PI / 2)}>
          <Fade map={fade} size={[D, 0.5]} position={[0, 0, 0.25]} rotation={[-Math.PI / 2, 0, 0]} opacity={0.24} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <Fade key={`corner${side}`} map={fade} size={[H, 0.5]} position={[side * (W / 2 - 0.25), H / 2, 0.0015]} rotation={[0, 0, side * -(Math.PI / 2)]} opacity={0.2} />
      ))}
      {[-1, 1].map((side) => (
        <group key={`side${side}`} position={[side * (W / 2 - 0.0015), H / 2, 0]} rotation-y={side * -(Math.PI / 2)}>
          <Fade map={fade} size={[H, 0.5]} position={[side * 0.25, 0, 0]} rotation={[0, 0, side * (Math.PI / 2)]} opacity={0.2} />
        </group>
      ))}
      <Fade map={fade} size={[W, 0.36]} position={[0, H - 0.18, 0.0015]} opacity={0.14} />
    </group>
  );
}

/** Janela com caixilho, vidro (céu), peitoril e, quando cabe, cortinas leves de voil. */
function RoomWindow({ spec, layout, night, textures }: { spec: WindowSpec; layout: RoomLayout; night: boolean; textures: RoomTextures }) {
  const w = spec.width;
  const h = spec.top - spec.bottom;
  const cy = (spec.top + spec.bottom) / 2;
  const frame = 0.05;
  const depth = 0.07;
  const left = spec.wall === "left";
  const position: V3 = left ? [-layout.width / 2, cy, spec.center] : [spec.center, cy, 0];
  const sheer = useMemo(() => {
    if (!spec.sheers) return null;
    const height = Math.min(layout.height - 0.05, spec.top + 0.2) - 0.02;
    const g = new THREE.PlaneGeometry(0.62, height, 28, 1);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i += 1) p.setZ(i, 0.035 * Math.sin((p.getX(i) / 0.62) * Math.PI * 7));
    p.needsUpdate = true;
    g.computeVertexNormals();
    return { geometry: g, height };
  }, [spec.sheers, spec.top, layout.height]);
  useGeometryCleanup(sheer?.geometry);
  const frameColor = night ? "#3a3b40" : "#f4f2ee";
  return (
    <group position={position} rotation-y={left ? Math.PI / 2 : 0}>
      <mesh position-z={0.003}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={textures.sky} toneMapped={false} color={night ? "#ffffff" : "#ededed"} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`v${side}`} position={[side * (w / 2 + frame / 2), 0, depth / 2]}>
          <boxGeometry args={[frame, h + frame * 2, depth]} />
          <meshStandardMaterial color={frameColor} roughness={0.5} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`h${side}`} position={[0, side * (h / 2 + frame / 2), depth / 2]}>
          <boxGeometry args={[w, frame, depth]} />
          <meshStandardMaterial color={frameColor} roughness={0.5} />
        </mesh>
      ))}
      {w > 0.9 && (
        <mesh position={[0, 0, depth / 2]}>
          <boxGeometry args={[0.035, h, 0.04]} />
          <meshStandardMaterial color={frameColor} roughness={0.5} />
        </mesh>
      )}
      {spec.bottom > 0.3 && (
        <mesh position={[0, -h / 2 - frame - 0.015, 0.09]}>
          <boxGeometry args={[w + 0.2, 0.03, 0.18]} />
          <meshStandardMaterial color={frameColor} roughness={0.45} />
        </mesh>
      )}
      {sheer &&
        [-1, 1].map((side) => (
          <mesh key={`s${side}`} geometry={sheer.geometry} position={[side * (w / 2 + 0.16), 0.02 + sheer.height / 2 - cy, 0.12]}>
            <meshStandardMaterial color="#f7f5f0" emissive="#ffffff" emissiveIntensity={night ? 0.02 : 0.18} roughness={1} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      {sheer && (
        <mesh position={[0, 0.02 + sheer.height - cy, 0.12]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.012, 0.012, w + 0.9, 10]} />
          <meshStandardMaterial color="#2a2b2e" metalness={0.6} roughness={0.35} />
        </mesh>
      )}
    </group>
  );
}

/** Mancha de sol no piso, vinda da janela lateral (só de dia). */
function SunPatch({ spec, layout, textures }: { spec: WindowSpec; layout: RoomLayout; textures: RoomTextures }) {
  if (spec.wall !== "left") return null;
  return (
    <mesh position={[-layout.width / 2 + 1.05, 0.003, spec.center + 0.35]} rotation={[-Math.PI / 2, 0, -0.32]} renderOrder={2}>
      <planeGeometry args={[1.6, spec.width * 1.1]} />
      <meshBasicMaterial color="#ffe6bd" alphaMap={textures.softRect} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Painel de ripas de madeira na parede do fundo (recepção). */
function Slats({ x0, x1, height, map }: { x0: number; x1: number; height: number; map: THREE.Texture }) {
  const geometry = useMemo(() => meterPlane(x1 - x0, height, 0.72, 0.36), [x0, x1, height]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={[(x0 + x1) / 2, height / 2, 0.012]}>
      <meshStandardMaterial map={map} roughness={0.7} />
    </mesh>
  );
}

/** Spots embutidos no forro (recepção, cozinha, banheiro). */
function CeilingSpots({ xs, z, height }: { xs: number[]; z: number; height: number }) {
  return (
    <>
      {xs.map((x) => (
        <mesh key={x} position={[x, height - 0.002, z]} rotation-x={Math.PI / 2}>
          <circleGeometry args={[0.05, 24]} />
          <meshBasicMaterial color="#fff6e6" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function Living({ layout, env }: { layout: RoomLayout; env: RoomEnvironment }) {
  const { items } = layout;
  const p = env.preset.palette;
  const productCushion = env.hide.cushions;
  const pillows = productCushion ? [0.62] : [-0.62, 0.62];
  return (
    <>
      {items.sofa && (
        <group position={[items.sofa.x, 0, items.sofa.z]}>
          <Sofa color={p.fabric} />
          {/* Encostadas: a quina de trás de cima toca o encosto e a de baixo afunda no assento. */}
          {pillows.map((x, i) => (
            <ThrowPillow key={x} color={i === 0 && !productCushion ? p.accent : "#e9e1d3"} position={[x, SOFA.seatTop + 0.21, SOFA_BACKREST + 0.14]} rotation={[-0.32, x > 0 ? -0.18 : 0.18, x > 0 ? 0.06 : -0.06]} />
          ))}
        </group>
      )}
      {items.sideTable && (
        <group position={[items.sideTable.x, 0, items.sideTable.z]}>
          <SideTable />
          <group position={[0.08, SIDE_TABLE.height, -0.1]}>
            <TableLamp />
          </group>
        </group>
      )}
      {items.armchair && (
        <group position={[items.armchair.x, 0, items.armchair.z]} rotation-y={items.armchair.yaw ?? 0}>
          <Armchair color={p.fabric} />
          <ThrowPillow color={p.accent} position={[0, SOFA.seat + 0.18, 0.32]} rotation={[-0.3, 0, 0.05]} size={0.4} />
        </group>
      )}
      {items.floorLamp && (
        <group position={[items.floorLamp.x, 0, items.floorLamp.z]}>
          <FloorLamp />
        </group>
      )}
      {items.plant && (
        <group position={[items.plant.x, 0, items.plant.z]}>
          <Plant height={items.plant.height} seed={7} />
        </group>
      )}
    </>
  );
}

function Bedroom({ layout, env }: { layout: RoomLayout; env: RoomEnvironment }) {
  const { items } = layout;
  const p = env.preset.palette;
  const pillowX = env.hide.cushions ? 0.52 : 0.26;
  // Quadro de mesa no criado-mudo da esquerda: os livros saem.
  const topProduct = env.placement.spot === "top";
  return (
    <>
      {items.bed && (
        <group position={[items.bed.x, 0, items.bed.z]}>
          <Bed fabric={p.fabric} duvet="#f1eee8" accent={p.accent} />
          {/* Encostadas nos travesseiros, apoiadas no colchão. */}
          {[-1, 1].map((side) => (
            <ThrowPillow key={side} color={side < 0 ? p.accent : "#e7dfd2"} size={0.4} position={[side * pillowX, BED.mattress + 0.2, BED.pillowFront + 0.14]} rotation={[-0.36, side * -0.12, 0]} />
          ))}
        </group>
      )}
      {items.nightstands?.map((stand, i) => (
        <group key={stand.x} position={[stand.x, 0, stand.z]}>
          <Nightstand />
          {i === 1 ? (
            <group position={[0.05, NIGHTSTAND.height, NIGHTSTAND.depth / 2]}>
              <TableLamp color="#e7e0d4" />
            </group>
          ) : (
            !topProduct && (
              <group position={[0.06, NIGHTSTAND.height, NIGHTSTAND.depth / 2 + 0.02]}>
                <Books colors={["#d8c7a6", "#5f7059"]} />
              </group>
            )
          )}
        </group>
      ))}
      {items.plant && (
        <group position={[items.plant.x, 0, items.plant.z]}>
          <Plant height={items.plant.height} seed={13} potColor="#cdbfae" />
        </group>
      )}
    </>
  );
}

function Office({ layout, env }: { layout: RoomLayout; env: RoomEnvironment }) {
  const { items } = layout;
  const topProduct = env.placement.spot === "top";
  return (
    <>
      {items.desk && (
        <group position={[items.desk.x, 0, items.desk.z]}>
          <Desk />
          <group position={[0.36, DESK.height, 0.36]} rotation-y={-0.18}>
            <Laptop />
          </group>
          <group position={[-0.55, DESK.height, 0.2]} rotation-y={0.5}>
            <DeskLamp />
          </group>
          {!topProduct && (
            <group position={[-0.2, DESK.height, 0.22]}>
              <Books colors={["#2e4a5c", "#d8c7a6", "#b5553c"]} />
            </group>
          )}
          <mesh position={[0.62, DESK.height + 0.05, 0.5]}>
            <cylinderGeometry args={[0.04, 0.036, 0.1, 20]} />
            <meshStandardMaterial color="#f2efe9" roughness={0.35} />
          </mesh>
        </group>
      )}
      {items.chair && (
        <group position={[items.chair.x, 0, items.chair.z]} rotation-y={items.chair.yaw ?? 0}>
          <OfficeChair />
        </group>
      )}
      {items.bookcase && (
        <group position={[items.bookcase.x, 0, items.bookcase.z]}>
          <Bookcase />
        </group>
      )}
      {items.plant && (
        <group position={[items.plant.x, 0, items.plant.z]}>
          <Plant height={items.plant.height} seed={19} potColor="#2f3236" />
        </group>
      )}
    </>
  );
}

function Store({ layout, env, textures }: { layout: RoomLayout; env: RoomEnvironment; textures: RoomTextures }) {
  const { items } = layout;
  const p = env.preset.palette;
  return (
    <>
      {items.slats && textures.slats && <Slats x0={items.slats.x0} x1={items.slats.x1} height={layout.height} map={textures.slats} />}
      {items.counter && (
        <group position={[items.counter.x, 0, items.counter.z]}>
          <Counter color={env.night ? "#2f3035" : "#f1eee9"} />
          <group position={[0.7, COUNTER.height, COUNTER.depth / 2]}>
            <Plant height={0.42} seed={3} potColor="#2f3236" />
          </group>
        </group>
      )}
      {items.bench && (
        <group position={[items.bench.x, 0, items.bench.z]}>
          <Bench color={p.fabric} />
        </group>
      )}
      {items.plant && (
        <group position={[items.plant.x, 0, items.plant.z]}>
          <Plant height={items.plant.height} seed={23} potColor="#d6cfc3" />
        </group>
      )}
      <CeilingSpots xs={[-1.2, 0, 1.2]} z={1.2} height={layout.height} />
    </>
  );
}

function Kitchen({ layout, env }: { layout: RoomLayout; env: RoomEnvironment }) {
  const { items } = layout;
  const p = env.preset.palette;
  return (
    <>
      {items.sideboard && (
        <group position={[items.sideboard.x, 0, items.sideboard.z]}>
          <Sideboard />
          <group position={[-0.45, SIDEBOARD.height, SIDEBOARD.depth / 2]}>
            <Plant height={0.45} seed={5} potColor="#e9e3d9" />
          </group>
          <mesh position={[0.35, SIDEBOARD.height + 0.04, SIDEBOARD.depth / 2]}>
            <cylinderGeometry args={[0.16, 0.1, 0.08, 32, 1, true]} />
            <meshStandardMaterial color="#e6dfd3" roughness={0.4} side={THREE.DoubleSide} />
          </mesh>
          {[-0.05, 0.06, 0.0].map((x, i) => (
            <mesh key={i} position={[0.35 + x, SIDEBOARD.height + 0.07 + (i === 2 ? 0.04 : 0), SIDEBOARD.depth / 2 + (i - 1) * 0.04]}>
              <sphereGeometry args={[0.04, 16, 12]} />
              <meshStandardMaterial color={["#d9a441", "#c4542f", "#8aa04d"][i]} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )}
      {items.dining && (
        <group position={[items.dining.x, 0, items.dining.z]}>
          <DiningTable />
        </group>
      )}
      {items.diningChairs?.map((chair) => (
        <group key={chair.x} position={[chair.x, 0, chair.z]} rotation-y={chair.yaw ?? 0}>
          <DiningChair color={p.fabric} />
        </group>
      ))}
      {items.kitchenRun && (
        <group position={[items.kitchenRun.x, 0, items.kitchenRun.z]}>
          <KitchenRun />
        </group>
      )}
      {items.pendant && (
        <group position={[items.pendant.x, layout.height, items.pendant.z]}>
          <Pendant drop={Math.max(0.5, layout.height - 1.75)} />
        </group>
      )}
      {items.plant && (
        <group position={[items.plant.x, 0, items.plant.z]}>
          <Plant height={items.plant.height} seed={31} potColor="#c9b8a2" />
        </group>
      )}
    </>
  );
}

function Bathroom({ layout }: { layout: RoomLayout }) {
  const { items } = layout;
  return (
    <>
      {items.vanity && (
        <group position={[items.vanity.x, 0, items.vanity.z]}>
          <Vanity />
        </group>
      )}
      {items.plant && (
        <group position={[items.plant.x, 0, items.plant.z]}>
          <Plant height={items.plant.height} seed={37} potColor="#e9e3d9" />
        </group>
      )}
      <CeilingSpots xs={[-0.6, 0.6]} z={1} height={layout.height} />
    </>
  );
}

/** Sombras e prateleira que dependem da peça: escondidas até o posicionamento medir a peça. */
function ProductProps({ textures }: { textures: RoomTextures }) {
  return (
    <>
      <mesh name={ROOM_DROP} visible={false} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#000000" alphaMap={textures.softRect} transparent opacity={0.3} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh name={ROOM_CONTACT} visible={false} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#000000" alphaMap={textures.softRect} transparent opacity={0.42} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <group name={ROOM_SHELF} visible={false}>
        <FloatingShelf />
      </group>
    </>
  );
}

/** A sala inteira, em metros, com a origem no pé da parede do fundo. */
export function RoomScene({ env }: { env: RoomEnvironment }) {
  const layout = useMemo(() => roomLayout(env), [env]);
  const { id, palette } = env.preset;
  const textures = useMemo(() => makeRoomTextures(id, palette.floor, palette.wood, env.night), [id, palette.floor, palette.wood, env.night]);
  useEffect(() => () => disposeRoomTextures(textures), [textures]);
  const art = layout.wallArt;
  const rug = layout.rug;
  return (
    <TexturesContext.Provider value={textures}>
      <NightContext.Provider value={env.night}>
        <Shell layout={layout} env={env} textures={textures} />
        {layout.window && <RoomWindow spec={layout.window} layout={layout} night={env.night} textures={textures} />}
        {layout.window && !env.night && <SunPatch spec={layout.window} layout={layout} textures={textures} />}
        {art && (
          <group position={[art.x, art.y, 0]}>
            <WallArt w={art.w} h={art.h} />
          </group>
        )}
        {rug && (
          <group position={[rug.x, 0, rug.z]}>
            <DecorRug w={rug.w} d={rug.d} />
          </group>
        )}
        {layout.room === "living" && <Living layout={layout} env={env} />}
        {layout.room === "bedroom" && <Bedroom layout={layout} env={env} />}
        {layout.room === "office" && <Office layout={layout} env={env} />}
        {layout.room === "store" && <Store layout={layout} env={env} textures={textures} />}
        {layout.room === "kitchen" && <Kitchen layout={layout} env={env} />}
        {layout.room === "bathroom" && <Bathroom layout={layout} />}
        <ProductProps textures={textures} />
      </NightContext.Provider>
    </TexturesContext.Provider>
  );
}

/**
 * Luz fixa da sala (não gira com a câmera, ao contrário do estúdio): janela à esquerda, rebatimento
 * quente do piso, preenchimento do lado da câmera e reflexos de janela/teto no ambiente. À noite
 * (neon) fica só a luz baixa e quente do abajur; o próprio neon ilumina a parede.
 */
export const RoomLights = memo(function RoomLights({ night, wall }: { night: boolean; wall: string }) {
  return (
    <>
      <hemisphereLight color={night ? "#8f98b8" : "#fff8ef"} groundColor={night ? "#3a3027" : "#b8a083"} intensity={night ? 0.16 : 0.62} />
      <directionalLight position={[-4, 3.2, 2.2]} intensity={night ? 0.1 : 1.35} color={night ? "#9fb0e0" : "#fff3e2"} />
      <directionalLight position={[3, 2.2, 4]} intensity={night ? 0.34 : 0.42} color={night ? "#ffc98a" : "#f2f5ff"} />
      <Environment resolution={128} environmentIntensity={night ? 0.22 : 0.7}>
        {/* Janela (luz do dia) e teto claro. */}
        <Lightformer form="rect" intensity={night ? 0.5 : 3.2} position={[-6, 2, 1.5]} scale={[3.5, 2.6, 1]} color={night ? "#4a5a8a" : "#fff7ea"} />
        <Lightformer form="rect" intensity={night ? 0.12 : 0.9} position={[0, 7, 1]} scale={[8, 8, 1]} color="#fff4e6" />
        {/* Paredes e piso rebatendo a luz na cor deles. */}
        <Lightformer form="rect" intensity={night ? 0.06 : 0.55} position={[0, 1.5, -7]} scale={[12, 5, 1]} color={wall} />
        <Lightformer form="rect" intensity={night ? 0.04 : 0.45} position={[7, 1.5, 0]} scale={[10, 5, 1]} color={wall} />
        <Lightformer form="rect" intensity={night ? 0.05 : 0.35} position={[0, -6, 0]} scale={[12, 12, 1]} color="#c9ae8c" />
        {/* Abajur quente. */}
        <Lightformer form="circle" intensity={night ? 2.4 : 0.6} position={[4, 1.4, 2]} scale={1.6} color="#ffcf8a" />
      </Environment>
    </>
  );
});
