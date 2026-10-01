"use client";

import { Suspense, useEffect, useState, type MutableRefObject } from "react";
import { Canvas, useThree, type RootState } from "@react-three/fiber";
import { Bounds, Center, ContactShadows, Environment, Lightformer, OrbitControls, useBounds } from "@react-three/drei";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import type { ArtSettings } from "./art";
import { MockupModel } from "./models";

export type CaptureFn = () => string | null;

const WRAPPED: MockupSpec["kind"][] = ["mug", "tumbler", "bottle", "tshirt", "cap"];

type ViewerProps = {
  spec: MockupSpec;
  art: ArtSettings;
  label: string;
  captureRef?: MutableRefObject<CaptureFn | null>;
  controls?: boolean;
  autoRotate?: boolean;
  className?: string;
};

const CAPTURE_DIRECTION = new THREE.Vector3(0.45, 0.28, 1).normalize();

function snapshot(state: RootState, background: string): string | null {
  const { gl, scene, camera } = state;
  const controls = state.controls as unknown as { target?: THREE.Vector3 } | null;
  const target = controls?.target ?? new THREE.Vector3();
  const saved = camera.position.clone();
  camera.position.copy(target).addScaledVector(CAPTURE_DIRECTION, saved.distanceTo(target));
  camera.lookAt(target);
  gl.render(scene, camera);
  const source = gl.domElement;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0);
  }
  camera.position.copy(saved);
  camera.lookAt(target);
  gl.render(scene, camera);
  return ctx ? out.toDataURL("image/jpeg", 0.85) : null;
}

function Capture({ captureRef, background }: { captureRef?: MutableRefObject<CaptureFn | null>; background: string }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    if (!captureRef) return;
    const previous = captureRef.current;
    const capture: CaptureFn = () => snapshot(get(), background);
    captureRef.current = capture;
    return () => {
      if (captureRef.current === capture) captureRef.current = previous;
    };
  }, [get, captureRef, background]);
  return null;
}

function Refit({ token }: { token: string }) {
  const bounds = useBounds();
  useEffect(() => {
    bounds.refresh().clip().fit();
  }, [bounds, token]);
  return null;
}

export default function MockupViewer({ spec, art, label, captureRef, controls = true, autoRotate = true, className = "" }: ViewerProps) {
  const [spinning, setSpinning] = useState(autoRotate);
  const [dims, setDims] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const dark = spec.kind === "neon";
  const modelKey = `${spec.kind}-${spec.widthCm}-${spec.heightCm}-${spec.shape}-${spec.sleeveless}-${spec.grommets}`;

  return (
    <div className={`relative overflow-hidden rounded-card ${dark ? "bg-[#17171c]" : "bg-mist"} ${className}`}>
      <Canvas
        flat
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: [0, 0.6, 6], fov: 30 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
        className="touch-none"
      >
        <ambientLight intensity={dark ? 0.15 : 0.9} />
        <directionalLight position={[3, 5, 4]} intensity={dark ? 0.4 : 1.1} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 2, -3]} intensity={dark ? 0.1 : 0.45} />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={dark ? 0.6 : 1.6} position={[0, 4, 3]} scale={[10, 3, 1]} />
          <Lightformer form="rect" intensity={dark ? 0.3 : 0.9} position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} />
          <Lightformer form="rect" intensity={dark ? 0.3 : 0.9} position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} />
          <Lightformer form="rect" intensity={dark ? 0.2 : 0.8} position={[0, 1, 6]} scale={[8, 4, 1]} />
          <Lightformer form="circle" intensity={1.2} position={[0, 1, -6]} scale={3} color="#ffd9d6" />
        </Environment>
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.4}>
            <Refit token={`${modelKey}-${resetToken}`} />
            <group position-y={-1.2}>
              <Center bottom key={modelKey}>
                <MockupModel spec={spec} art={art} label={label} showDims={dims && controls} />
              </Center>
            </group>
          </Bounds>
        </Suspense>
        <ContactShadows position={[0, -1.205, 0]} opacity={dark ? 0.6 : 0.32} scale={9} blur={2.4} far={3.5} />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={controls}
          minDistance={2.2}
          maxDistance={12}
          autoRotate={spinning}
          autoRotateSpeed={0.9}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI / 1.85}
          onStart={() => setSpinning(false)}
        />
        <Capture captureRef={captureRef} background={dark ? "#17171c" : "#f5f5f5"} />
      </Canvas>

      {controls && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">3D</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${dark ? "bg-white/10 text-white" : "bg-white/80 text-ink"}`}>
              Arraste para girar · role para zoom
            </span>
          </div>
          <div className="absolute bottom-3 right-3 flex gap-1.5">
            <ViewerButton dark={dark} label={spinning ? "Pausar rotação" : "Girar sozinho"} onClick={() => setSpinning((v) => !v)}>
              {spinning ? (
                <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
              ) : (
                <path d="M12 5a7 7 0 1 1-6.32 4H3l3.5-4L10 9H7.86A5 5 0 1 0 12 7z" />
              )}
            </ViewerButton>
            <ViewerButton dark={dark} label={dims ? "Ocultar medidas" : "Mostrar medidas"} onClick={() => setDims((v) => !v)} active={dims}>
              <path d="M3 17h18v2H3zM3 5h2v10H3zM19 5h2v10h-2zM7 9h10v2H7z" />
            </ViewerButton>
            <ViewerButton
              dark={dark}
              label="Centralizar"
              onClick={() => {
                setResetToken((t) => t + 1);
                setSpinning(true);
              }}
            >
              <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1-6h2v4h-2zm0 16h2v4h-2zM2 11h4v2H2zm16 0h4v2h-4z" />
            </ViewerButton>
          </div>
          <span className={`pointer-events-none absolute bottom-3 left-3 rounded-[10px] px-2.5 py-1.5 text-center text-[11px] font-bold leading-tight ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}>
            {spec.label}
            <span className="block text-[9px] font-medium opacity-70">{WRAPPED.includes(spec.kind) ? "área de arte" : "tamanho"}</span>
          </span>
        </>
      )}
    </div>
  );
}

function ViewerButton({ children, label, onClick, active = false, dark }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; dark: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-full shadow-float transition-colors duration-200 ${
        active ? "bg-ink text-white" : dark ? "bg-white/90 text-ink hover:bg-white" : "bg-white text-ink hover:bg-ink hover:text-white"
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
