"use client";

import Image from "next/image";
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { imageUrl } from "@/lib/format";
import type { ArtSettings } from "./art";
import { MockupModel } from "./models";
import { MockupSkeleton } from "./MockupSkeleton";
import { AnimateContext, canUseWebGL, useInViewport, useMediaQuery } from "./viewer-hooks";

export type CaptureFn = () => string | null;

type ViewerProps = {
  spec: MockupSpec;
  art: ArtSettings;
  label: string;
  captureRef?: MutableRefObject<CaptureFn | null>;
  /** Foto do catálogo, mostrada quando o 3D não abre. */
  fallbackImage?: string;
  className?: string;
};

/** Vista inicial: de frente e um pouco acima; os modelos já se giram em 3/4. */
const HOME_DIRECTION = new THREE.Vector3(0, 0.12, 1).normalize();
/** Ângulo do snapshot que vai para o carrinho. */
const CAPTURE_DIRECTION = new THREE.Vector3(0.45, 0.28, 1).normalize();
const FIT_MARGIN = 1.22;
const RESUME_AFTER_MS = 4000;
const SPIN_SPEED = 0.9;
const RESET_SECONDS = 0.6;

type Framing = { center: THREE.Vector3; distance: number };
type Tween = { t: number; started: boolean; fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 };

const point = new THREE.Vector3();

/** Caixa das malhas do modelo, ignorando cotas e rótulos (userData.noBounds). */
function measureBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  const visit = (object: THREE.Object3D) => {
    if (object.userData.noBounds) return;
    const mesh = object as THREE.Mesh;
    const position = mesh.isMesh ? mesh.geometry?.getAttribute("position") : undefined;
    if (position) {
      for (let i = 0; i < position.count; i += 1) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
    }
    object.children.forEach(visit);
  };
  visit(root);
  return box;
}

function frameBox(box: THREE.Box3, camera: THREE.PerspectiveCamera): Framing {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const distance = (sphere.radius / Math.sin(Math.min(vertical, horizontal) / 2)) * FIT_MARGIN;
  return { center: sphere.center, distance };
}

function snapshot(state: RootState, background: string): string | null {
  const { gl, scene, camera } = state;
  const controls = state.controls as unknown as OrbitControlsImpl | null;
  const target = controls?.target ?? new THREE.Vector3();
  const hidden: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.noBounds && object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });
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
  hidden.forEach((object) => {
    object.visible = true;
  });
  camera.position.copy(saved);
  camera.lookAt(target);
  gl.render(scene, camera);
  return ctx ? out.toDataURL("image/jpeg", 0.85) : null;
}

function Capture({ captureRef, surface }: { captureRef?: MutableRefObject<CaptureFn | null>; surface: MutableRefObject<HTMLDivElement | null> }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    if (!captureRef) return;
    const previous = captureRef.current;
    const capture: CaptureFn = () => {
      const background = surface.current ? getComputedStyle(surface.current).backgroundColor : "#f4f4f4";
      return snapshot(get(), background);
    };
    captureRef.current = capture;
    return () => {
      if (captureRef.current === capture) captureRef.current = previous;
    };
  }, [get, captureRef, surface]);
  return null;
}

/** O OrbitControls grava touch-action: none; liberamos o arraste vertical para a página rolar. */
function TouchPolicy() {
  const controls = useThree((state) => state.controls);
  const get = useThree((state) => state.get);
  useEffect(() => {
    get().gl.domElement.style.touchAction = "pan-y";
  }, [controls, get]);
  return null;
}

/** Velocidade da auto-rotação por segundo, igual em telas de 60 e 120 Hz. */
function SpinClock({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);
  useFrame((state, delta) => {
    const controls = state.controls as unknown as OrbitControlsImpl | null;
    if (controls) controls.autoRotateSpeed = SPIN_SPEED * Math.min(delta, 0.1) * 60;
  }, -2);
  return null;
}

type StageProps = {
  spec: MockupSpec;
  art: ArtSettings;
  label: string;
  showDims: boolean;
  modelKey: string;
  resetToken: number;
  reducedMotion: boolean;
  ready: boolean;
  onReady: (kind: MockupSpec["kind"]) => void;
};

function Stage({ spec, art, label, showDims, modelKey, resetToken, reducedMotion, ready, onReady }: StageProps) {
  const group = useRef<THREE.Group>(null);
  const get = useThree((state) => state.get);
  const hasControls = useThree((state) => Boolean(state.controls));
  const invalidate = useThree((state) => state.invalidate);
  const framing = useRef<Framing | null>(null);
  const tween = useRef<Tween | null>(null);
  const handledReset = useRef(resetToken);

  // Apoia a peça no chão (y = 0), centraliza em x/z e enquadra a câmera na vista inicial.
  useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    const camera = get().camera as THREE.PerspectiveCamera;
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    root.position.set(0, 0, 0);
    const raw = measureBox(root);
    if (raw.isEmpty()) return;
    const center = raw.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -raw.min.y, -center.z);
    const next = frameBox(measureBox(root), camera);
    framing.current = next;
    camera.near = next.distance / 50;
    camera.far = next.distance * 20;
    camera.position.copy(next.center).addScaledVector(HOME_DIRECTION, next.distance);
    camera.lookAt(next.center);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(next.center);
      controls.minDistance = next.distance * 0.45;
      controls.maxDistance = next.distance * 2;
      controls.update();
    }
    invalidate();
  }, [modelKey, hasControls, get, invalidate]);

  // Compila os shaders sem travar a página antes de mostrar a peça.
  useEffect(() => {
    if (ready) return;
    let alive = true;
    const { gl, scene, camera } = get();
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        onReady(spec.kind);
        invalidate();
      });
    return () => {
      alive = false;
    };
  }, [ready, get, spec.kind, onReady, invalidate]);

  // "Centralizar" volta à vista inicial.
  useEffect(() => {
    if (resetToken === handledReset.current) return;
    handledReset.current = resetToken;
    const goal = framing.current;
    const { camera } = get();
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    if (!goal || !controls) return;
    const toPos = goal.center.clone().addScaledVector(HOME_DIRECTION, goal.distance);
    if (reducedMotion) {
      camera.position.copy(toPos);
      controls.target.copy(goal.center);
      controls.update();
      invalidate();
      return;
    }
    tween.current = { t: 0, started: false, fromPos: camera.position.clone(), toPos, fromTarget: controls.target.clone(), toTarget: goal.center.clone() };
    invalidate();
  }, [resetToken, reducedMotion, get, invalidate]);

  useFrame((state, delta) => {
    const active = tween.current;
    const controls = state.controls as unknown as OrbitControlsImpl | null;
    if (!active || !controls) return;
    // O primeiro frame depois de um tempo parado traz um delta enorme; ele só marca o início.
    if (!active.started) {
      active.started = true;
      invalidate();
      return;
    }
    active.t = Math.min(1, active.t + delta / RESET_SECONDS);
    const k = 1 - Math.pow(1 - active.t, 3);
    state.camera.position.lerpVectors(active.fromPos, active.toPos, k);
    controls.target.lerpVectors(active.fromTarget, active.toTarget, k);
    controls.update();
    if (active.t >= 1) tween.current = null;
    else invalidate();
  });

  return (
    <group ref={group} visible={ready}>
      <MockupModel key={modelKey} spec={spec} art={art} label={label} showDims={showDims} />
    </group>
  );
}

function Lights({ dark }: { dark: boolean }) {
  return (
    <>
      <ambientLight intensity={dark ? 0.12 : 0.45} />
      <directionalLight position={[3, 5, 4]} intensity={dark ? 0.35 : 1.25} />
      <directionalLight position={[-4, 2, -3]} intensity={dark ? 0.1 : 0.55} />
      {/* Contraluz: a peça gira sozinha, então o verso também precisa ficar claro. */}
      <directionalLight position={[0, 4, -6]} intensity={dark ? 0.1 : 0.6} />
      <Environment resolution={256} environmentIntensity={dark ? 0.5 : 0.95}>
        <Lightformer form="rect" intensity={dark ? 0.6 : 1.6} position={[0, 4, 3]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={dark ? 0.3 : 0.9} position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={dark ? 0.3 : 0.9} position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={dark ? 0.2 : 0.8} position={[0, 1, 6]} scale={[8, 4, 1]} />
        <Lightformer form="circle" intensity={1.2} position={[0, 1, -6]} scale={3} color="#ffd9d6" />
      </Environment>
    </>
  );
}

class MockupBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ViewerFallback({ image, label, onRetry }: { image?: string; label: string; onRetry?: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col">
      {image && <Image src={imageUrl(image)} alt={label} fill sizes="(max-width: 1024px) 90vw, 560px" className="object-contain p-8" />}
      <div role="status" className="relative z-10 m-3 mt-auto rounded-control bg-white/95 p-4 text-center shadow-float">
        <p className="text-sm font-semibold">Não foi possível abrir o 3D neste aparelho.</p>
        <p className="mt-0.5 text-[13px] text-muted">Mostramos a foto do produto. Você pode continuar o pedido normalmente.</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white">
            Tentar de novo
          </button>
        )}
      </div>
    </div>
  );
}

export default function MockupViewer({ spec, art, label, captureRef, fallbackImage, className = "" }: ViewerProps) {
  const surface = useRef<HTMLDivElement>(null);
  const visible = useInViewport(surface);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const [supported] = useState(canUseWebGL);
  const [attempt, setAttempt] = useState(0);
  const [lost, setLost] = useState(false);
  const [readyKind, setReadyKind] = useState<MockupSpec["kind"] | null>(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [dims, setDims] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const idleTimer = useRef<number | null>(null);

  const info = KIND_INFO[spec.kind];
  const dark = info.scene === "dark";
  const ready = readyKind === spec.kind;
  const showDims = dims && info.dims;
  const autoRotate = ready && visible && !paused && !interacting && !reducedMotion;
  const modelKey = `${spec.kind}-${spec.widthCm}-${spec.heightCm}-${spec.shape}-${spec.sleeveless}-${spec.grommets}`;

  const onInteractStart = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    setInteracting(true);
  }, []);
  const onInteractEnd = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setInteracting(false), RESUME_AFTER_MS);
  }, []);
  useEffect(
    () => () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    },
    [],
  );

  const onCreated = useCallback((state: RootState) => {
    state.gl.domElement.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        setLost(true);
      },
      { once: true },
    );
  }, []);

  const retry = useCallback(() => {
    setLost(false);
    setReadyKind(null);
    setAttempt((a) => a + 1);
  }, []);

  const hint = coarse ? "Arraste para girar · pinça para zoom" : armed ? "Arraste para girar · role para zoom" : "Arraste para girar · clique e role para zoom";
  const failed = !supported || lost;

  return (
    <div
      ref={surface}
      data-kind={spec.kind}
      data-ready={ready}
      onPointerDown={() => setArmed(true)}
      onPointerLeave={() => setArmed(false)}
      className={`relative overflow-hidden rounded-card ${dark ? "bg-[#17171c]" : "bg-mist"} ${className}`}
    >
      {failed ? (
        <ViewerFallback image={fallbackImage} label={label} onRetry={supported ? retry : undefined} />
      ) : (
        <MockupBoundary key={attempt} fallback={<ViewerFallback image={fallbackImage} label={label} onRetry={retry} />}>
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ position: [0, 0.6, 6], fov: 30 }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }}
            onCreated={onCreated}
            aria-label={`Mockup 3D: ${label}`}
          >
            <AnimateContext.Provider value={visible && !reducedMotion}>
              <Lights dark={dark} />
              <Stage
                spec={spec}
                art={art}
                label={label}
                showDims={showDims}
                modelKey={modelKey}
                resetToken={resetToken}
                reducedMotion={reducedMotion}
                ready={ready}
                onReady={setReadyKind}
              />
              {ready && <ContactShadows key={modelKey} frames={1} position={[0, -0.002, 0]} opacity={dark ? 0.6 : 0.32} scale={9} blur={2.4} far={3.5} />}
              <OrbitControls
                makeDefault
                enablePan={false}
                enableZoom={coarse || armed}
                autoRotate={autoRotate}
                minPolarAngle={0.35}
                maxPolarAngle={Math.PI / 1.85}
                onStart={onInteractStart}
                onEnd={onInteractEnd}
              />
              <SpinClock active={autoRotate} />
              <TouchPolicy />
              <Capture captureRef={captureRef} surface={surface} />
            </AnimateContext.Provider>
          </Canvas>
        </MockupBoundary>
      )}

      {!failed && (
        <div aria-hidden={ready} className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}>
          <MockupSkeleton dark={dark} />
        </div>
      )}

      {!failed && ready && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
            <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">3D</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${dark ? "bg-white/10 text-white" : "bg-white/80 text-ink"}`}>{hint}</span>
          </div>
          <div className="absolute bottom-3 right-3 flex gap-1.5">
            <ViewerButton dark={dark} label={paused ? "Girar sozinho" : "Pausar rotação"} onClick={() => setPaused((v) => !v)}>
              {paused ? <path d="M12 5a7 7 0 1 1-6.32 4H3l3.5-4L10 9H7.86A5 5 0 1 0 12 7z" /> : <path d="M7 5h3v14H7zM14 5h3v14h-3z" />}
            </ViewerButton>
            {info.dims && (
              <ViewerButton dark={dark} label={dims ? "Ocultar medidas" : "Mostrar medidas"} onClick={() => setDims((v) => !v)} active={dims}>
                <path d="M3 17h18v2H3zM3 5h2v10H3zM19 5h2v10h-2zM7 9h10v2H7z" />
              </ViewerButton>
            )}
            <ViewerButton dark={dark} label="Voltar à vista inicial" onClick={() => setResetToken((t) => t + 1)}>
              <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1-6h2v4h-2zm0 16h2v4h-2zM2 11h4v2H2zm16 0h4v2h-4z" />
            </ViewerButton>
          </div>
          <span
            className={`pointer-events-none absolute bottom-3 left-3 rounded-[10px] px-2.5 py-1.5 text-center text-[11px] font-bold leading-tight ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}
          >
            {spec.label}
            <span className="block text-[9px] font-medium opacity-70">{info.sizeIsArtArea ? "área de arte" : "tamanho"}</span>
          </span>
        </>
      )}
    </div>
  );
}

function ViewerButton({ children, label, onClick, active = false, dark }: { children: ReactNode; label: string; onClick: () => void; active?: boolean; dark: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
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
