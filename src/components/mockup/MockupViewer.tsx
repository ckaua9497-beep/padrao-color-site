"use client";

import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import type { ArtSettings } from "./art";
import { MockupModel } from "./models";
import { sizeLabels } from "./models/shared";
import { MockupSkeleton, backdropCss, duskBackdrop, paintBackdrop, studioBackdrop, type Backdrop } from "./MockupSkeleton";
import { AnimateContext, SceneContext, canUseWebGL, useAnimate, useFullscreenSupport, useInViewport, useIsFullscreen, useMediaQuery, type SceneMode } from "./viewer-hooks";
import { PRESETS, environmentFor, roomBackdropColor, roomsFor, type RoomEnvironment, type RoomId } from "./environments/presets";
import { RoomLights, RoomScene } from "./environments/Room";
import { RoomDims } from "./environments/RoomDims";
import { measureBox, placeInRoom } from "./environments/placement";
import { FotoProduto } from "@/components/FotoProduto";

/**
 * Foto do estúdio no ângulo 3/4 do carrinho: JPEG com o fundo da tela. `transparent`: PNG sem fundo (só a peça e a
 * sombra), para as fotos de catálogo; `turn` gira o ângulo da foto (rad) em volta da peça.
 */
export type CaptureOptions = { transparent?: boolean; turn?: number };
export type CaptureFn = (options?: CaptureOptions) => string | null;
/** Foto do estúdio: `jpeg` no ângulo 3/4 do carrinho; `png` na vista atual (botão "Baixar imagem"). */
type ShotFn = (format: "jpeg" | "png") => string | null;

/** Lado da peça mostrado (almofada): a página pode pedir o verso quando o cliente edita a arte do verso. */
export type ViewerSide = "front" | "back";

type ViewerProps = {
  spec: MockupSpec;
  art: ArtSettings;
  label: string;
  captureRef?: MutableRefObject<CaptureFn | null>;
  /** Foto do catálogo, mostrada quando o 3D não abre. */
  fallbackImage?: string;
  /**
   * Lado mostrado ao abrir e sempre que este valor mudar (ex.: aba "Verso" do passo da arte). O botão
   * "Ver verso" do viewer continua valendo até a página mudar o valor de novo.
   */
  side?: ViewerSide;
  /**
   * Foco na arte (a placa da fachada): > 0 leva a câmera de frente para a parte do modelo marcada com
   * `userData.focus`, escurece o estúdio como no fim de tarde e acende as luzes do modelo; um número novo refaz
   * a aproximação (cada clique num estilo) e 0 volta à vista inicial.
   */
  focus?: number;
  className?: string;
};

/** Vista inicial: de frente e um pouco acima; os modelos já se giram em 3/4. */
const HOME_DIRECTION = new THREE.Vector3(0, 0.12, 1).normalize();
/** Ângulo do snapshot que vai para o carrinho: giro de ~24° e altura mínima de ~14°. */
// ~11°: um toque de 3/4 sem tirar de frente a arte das peças cilíndricas (caneca, garrafa).
const CAPTURE_AZIMUTH = Math.atan2(0.2, 1);
const CAPTURE_ELEVATION = 0.25;
const FIT_MARGIN = 1.22;
const RESUME_AFTER_MS = 4000;
const SPIN_SPEED = 0.9;
const RESET_SECONDS = 0.6;
const INTRO_SECONDS = 0.9;
/** Aproximação até a arte em foco (a placa da fachada) e a volta para a vista inicial. */
const FOCUS_SECONDS = 1.15;
const UNFOCUS_SECONDS = 0.9;
/** Com uma arte em foco no modelo, o zoom chega até esta fração da distância de frente para ela. */
const FOCUS_MIN_ZOOM = 0.55;
/** Fim de tarde do foco: fundo, velocidade da transição e quanto sobra de cada luz do estúdio. */
const DUSK_BACKDROP = duskBackdrop();
const DUSK_CSS = backdropCss(DUSK_BACKDROP);
const DUSK_RATE = 3.2;
const DUSK_ENVIRONMENT = 0.3;
const DUSK_LIGHTS = 0.24;
const DUSK_SKY = 0.4;
/** Luzes diretas do estúdio (key, fill, rim alto e rim baixo), na ordem do grupo que gira com a câmera. */
const RIG_INTENSITY = [1.5, 0.42, 1, 0.4] as const;
/** Entrada: a câmera parte mais longe, girada para a direita e um pouco mais alta, e pousa na vista inicial. */
const INTRO_ORBIT = { azimuth: 0.62, polar: -0.14, zoom: 1.38 };
const RIG_NAME = "studio-rig";
/** Quadros de sombra depois de cada troca (o segundo e o terceiro pegam decalques montados com atraso). */
const SHADOW_FRAMES = 3;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_GLOW = ["#ff4fd8", "#38e1ff"];
const STUDIO_FOV = 30;
/** Lente mais aberta no ambiente: mostra o móvel sem levar a câmera para fora do cômodo. */
const ROOM_FOV = 42;
/** No ambiente o cômodo pode sair do quadro; a peça e o móvel de escala ficam. */
const ROOM_MARGIN = 1.04;
const STUDIO_ZOOM: [number, number] = [0.45, 2];
/** Na sala dá para chegar perto da arte, mas não sair do cômodo. */
const ROOM_ZOOM: [number, number] = [0.4, 1.25];
/** Troca estúdio ↔ ambiente: o canvas some, a cena troca e volta (sem pulo de câmera visível). */
const FADE_MS = 200;
/** Duração da virada da almofada ("Ver verso"); a sombra de contato acompanha. */
const FLIP_MS = 750;
/** Tipos que viram para mostrar o verso (os mesmos que têm "Frente | Verso" no passo da arte, menos a camisa). */
const BACK_VIEW_KINDS: ReadonlySet<MockupSpec["kind"]> = new Set(["cushion", "petbed", "tshirt"]);

type Framing = {
  center: THREE.Vector3;
  distance: number;
  home: THREE.Vector3;
  radius: number;
  footprint: number;
  height: number;
  /** Folga do enquadramento (estúdio: FIT_MARGIN; ambiente: ROOM_MARGIN). */
  margin: number;
  /** Zoom mínimo e máximo, em × distância de enquadramento. */
  zoom: [number, number];
  /** Direção da foto do carrinho; null = 3/4 do estúdio (captureDirection). */
  capture: THREE.Vector3 | null;
  /** Luz fixa do ambiente: o snapshot não gira o estúdio junto com a câmera. */
  fixed: boolean;
};

/**
 * Ângulo inicial pedido pelo modelo: `userData.view = { elevation, azimuth }` (radianos) em qualquer grupo
 * do modelo. Peças que ficam deitadas (cama, toalha de mesa, quebra-cabeça) sobem a câmera em vez de
 * inclinar a peça, e a sombra de contato continua certa. `distance` multiplica a distância do enquadramento
 * (< 1 aproxima): a fachada, larga e rasa, cabe bem mais perto que a esfera em volta dela.
 */
export type ViewHint = { elevation?: number; azimuth?: number; distance?: number };

function viewHint(root: THREE.Object3D): ViewHint {
  let hint: ViewHint | null = null;
  root.traverse((object) => {
    if (!hint && object.userData.view) hint = object.userData.view as ViewHint;
  });
  return hint ?? {};
}

function homeDirection({ elevation, azimuth = 0 }: ViewHint): THREE.Vector3 {
  if (elevation === undefined && !azimuth) return HOME_DIRECTION.clone();
  // A câmera não passa de ~70° (minPolarAngle dos controles).
  const e = THREE.MathUtils.clamp(elevation ?? Math.asin(HOME_DIRECTION.y), 0, 1.2);
  return new THREE.Vector3(Math.sin(azimuth) * Math.cos(e), Math.sin(e), Math.cos(azimuth) * Math.cos(e));
}

/** Movimento de câmera em órbita (raio, altura e giro pelo caminho mais curto), não em linha reta. */
type Tween = {
  t: number;
  started: boolean;
  seconds: number;
  power: number;
  from: THREE.Spherical;
  to: THREE.Spherical;
  turn: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};

function makeTween(fromPos: THREE.Vector3, fromTarget: THREE.Vector3, toPos: THREE.Vector3, toTarget: THREE.Vector3, seconds: number, power: number): Tween {
  const from = new THREE.Spherical().setFromVector3(fromPos.clone().sub(fromTarget));
  const to = new THREE.Spherical().setFromVector3(toPos.clone().sub(toTarget));
  const delta = to.theta - from.theta;
  const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
  return { t: 0, started: false, seconds, power, from, to, turn, fromTarget: fromTarget.clone(), toTarget: toTarget.clone() };
}

const orbit = new THREE.Spherical();

function fitDistance(radius: number, camera: THREE.PerspectiveCamera, margin = FIT_MARGIN): number {
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect > 0 && Number.isFinite(camera.aspect) ? camera.aspect : 1;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return (Math.max(radius, 1e-3) / Math.sin(Math.min(vertical, horizontal) / 2)) * margin;
}

function frameBox(box: THREE.Box3, camera: THREE.PerspectiveCamera, home: THREE.Vector3, scale = 1): Framing {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const size = box.getSize(new THREE.Vector3());
  return {
    center: sphere.center,
    distance: fitDistance(sphere.radius, camera) * scale,
    home,
    radius: Math.max(sphere.radius, 1e-3),
    footprint: Math.max(size.x, size.z, 1e-3),
    height: Math.max(size.y, 1e-3),
    margin: FIT_MARGIN,
    zoom: STUDIO_ZOOM,
    capture: null,
    fixed: false,
  };
}

/** Parte do modelo marcada para o foco: `userData.focus` = true ou { elevation, margin }. */
type FocusHint = { elevation?: number; margin?: number };

function focusTarget(root: THREE.Object3D): { object: THREE.Object3D; hint: FocusHint } | null {
  let found: { object: THREE.Object3D; hint: FocusHint } | null = null;
  root.traverse((object) => {
    const value = object.userData.focus as FocusHint | boolean | undefined;
    if (!found && value) found = { object, hint: value === true ? {} : value };
  });
  return found;
}

/**
 * Vista de frente para a parte em foco: a caixa dela cabe na largura e na altura da tela (não na esfera, que
 * sobra numa placa larga e rasa). Dá para recuar até o máximo da vista inicial (`store`).
 */
function frameFocus(root: THREE.Object3D, camera: THREE.PerspectiveCamera, store: Framing): Framing | null {
  const target = focusTarget(root);
  if (!target) return null;
  const box = measureBox(target.object);
  if (box.isEmpty()) return null;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect > 0 && Number.isFinite(camera.aspect) ? camera.aspect : 1;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const margin = target.hint.margin ?? 1.12;
  const distance = Math.max(size.x / 2 / Math.tan(horizontal / 2), size.y / 2 / Math.tan(vertical / 2)) * margin + size.z / 2;
  const home = homeDirection({ elevation: target.hint.elevation ?? 0.03, azimuth: 0 });
  return {
    center,
    distance,
    home,
    radius: Math.max(size.length() / 2, 1e-3),
    footprint: Math.max(size.x, size.z, 1e-3),
    height: Math.max(size.y, 1e-3),
    margin,
    zoom: [FOCUS_MIN_ZOOM, Math.max(1, (store.distance * store.zoom[1]) / distance)],
    capture: home.clone(),
    fixed: false,
  };
}

/** Giro da câmera em volta do alvo; a luz do estúdio acompanha, como num prato giratório de fotografia. */
function cameraAzimuth(camera: THREE.Camera, target: THREE.Vector3 | null): number {
  return Math.atan2(camera.position.x - (target?.x ?? 0), camera.position.z - (target?.z ?? 0));
}

function orientStudio(scene: THREE.Scene, rig: THREE.Object3D | null | undefined, azimuth: number) {
  if (rig) rig.rotation.y = azimuth;
  scene.environmentRotation.y = azimuth;
}

/* ---------------------------------------------------------------------------------------------- */
/* Sombras de contato do estúdio                                                                   */
/* ---------------------------------------------------------------------------------------------- */

type ShadowLook = {
  /** Lado da área de sombra: pegada da peça × spread + raio × pad. */
  spread: number;
  pad: number;
  /** Altura (× raio) até onde a peça ainda escurece o chão. */
  reach: number;
  /** Desfoque em texels. */
  blur: number;
  resolution: number;
  /** Opacidade na cena clara e na escura. */
  opacity: [number, number];
};

const SHADOW_LOOKS: ShadowLook[] = [
  // Contato: curta, densa e quase nítida, só onde a peça encosta no chão.
  { spread: 1.2, pad: 0.12, reach: 0.12, blur: 1.4, resolution: 512, opacity: [0.62, 0.85] },
  // Ambiente: larga e bem macia, dá o peso da peça no ciclorama.
  { spread: 1.8, pad: 0.7, reach: 0.95, blur: 3.6, resolution: 256, opacity: [0.3, 0.5] },
];

type ShadowLayer = {
  look: ShadowLook;
  camera: THREE.OrthographicCamera;
  target: THREE.WebGLRenderTarget;
  scratch: THREE.WebGLRenderTarget;
  plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
};

type ShadowKit = {
  group: THREE.Group;
  layers: ShadowLayer[];
  depth: THREE.MeshDepthMaterial;
  blurH: THREE.ShaderMaterial;
  blurV: THREE.ShaderMaterial;
  quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  quadCamera: THREE.OrthographicCamera;
  pending: number;
  dispose: () => void;
};

function createShadowKit(dark: boolean): ShadowKit {
  const planeGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  const group = new THREE.Group();
  group.name = "studio-shadows";

  // Profundidade vista de baixo: quanto mais perto do chão, mais escuro (curva suave, não linear).
  const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(/}\s*$/, "\tgl_FragColor = vec4( vec3( 1.0 ), pow( clamp( 1.0 - fragCoordZ, 0.0, 1.0 ), 1.6 ) );\n}");
  };
  const blurH = new THREE.ShaderMaterial({ ...HorizontalBlurShader, uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms), depthTest: false, depthWrite: false });
  const blurV = new THREE.ShaderMaterial({ ...VerticalBlurShader, uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms), depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(quadGeometry, blurH);
  quad.position.z = -0.5;
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // Sombra levemente quente na cena clara, como num estúdio de papel; preta no neon.
  const tint = new THREE.Color(dark ? "#000000" : "#2b241f");

  const layers = SHADOW_LOOKS.map((look): ShadowLayer => {
    const target = new THREE.WebGLRenderTarget(look.resolution, look.resolution);
    const scratch = new THREE.WebGLRenderTarget(look.resolution, look.resolution);
    target.texture.generateMipmaps = false;
    scratch.texture.generateMipmaps = false;
    // A câmera olha para cima com +z no alto da imagem; o plano deitado tem +z para baixo no UV.
    target.texture.repeat.set(1, -1);
    target.texture.offset.set(0, 1);
    const material = new THREE.MeshBasicMaterial({
      map: target.texture,
      color: tint,
      transparent: true,
      depthWrite: false,
      opacity: look.opacity[dark ? 1 : 0],
      toneMapped: false,
    });
    const plane = new THREE.Mesh(planeGeometry, material);
    plane.position.y = 0.0005;
    group.add(plane);
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 1, 0);
    return { look, camera, target, scratch, plane };
  });

  return {
    group,
    layers,
    depth,
    blurH,
    blurV,
    quad,
    quadCamera,
    pending: SHADOW_FRAMES,
    dispose: () => {
      layers.forEach(({ target, scratch, plane }) => {
        target.dispose();
        scratch.dispose();
        plane.material.dispose();
      });
      planeGeometry.dispose();
      quadGeometry.dispose();
      depth.dispose();
      blurH.dispose();
      blurV.dispose();
    },
  };
}

const savedClear = new THREE.Color();
const hiddenOverlays: THREE.Object3D[] = [];
const hideOverlay = (object: THREE.Object3D) => {
  if (object.userData.noBounds && object.visible) {
    object.visible = false;
    hiddenOverlays.push(object);
  }
};
function restoreOverlays() {
  for (const object of hiddenOverlays) object.visible = true;
  hiddenOverlays.length = 0;
}

function blurLayer(kit: ShadowKit, gl: THREE.WebGLRenderer, layer: ShadowLayer, amount: number) {
  kit.quad.material = kit.blurH;
  kit.blurH.uniforms.tDiffuse.value = layer.target.texture;
  kit.blurH.uniforms.h.value = amount;
  gl.setRenderTarget(layer.scratch);
  gl.render(kit.quad, kit.quadCamera);
  kit.quad.material = kit.blurV;
  kit.blurV.uniforms.tDiffuse.value = layer.scratch.texture;
  kit.blurV.uniforms.v.value = amount;
  gl.setRenderTarget(layer.target);
  gl.render(kit.quad, kit.quadCamera);
}

function renderShadows(kit: ShadowKit, gl: THREE.WebGLRenderer, scene: THREE.Scene, frame: Framing) {
  const previousTarget = gl.getRenderTarget();
  gl.getClearColor(savedClear);
  const clearAlpha = gl.getClearAlpha();
  const background = scene.background;
  const override = scene.overrideMaterial;
  kit.group.visible = false;
  scene.traverse(hideOverlay);
  scene.background = null;
  scene.overrideMaterial = kit.depth;
  gl.setClearColor(0xffffff, 0);
  for (const layer of kit.layers) {
    const { look, camera, plane } = layer;
    const extent = frame.footprint * look.spread + frame.radius * look.pad;
    camera.left = -extent / 2;
    camera.right = extent / 2;
    camera.top = extent / 2;
    camera.bottom = -extent / 2;
    camera.near = 0;
    camera.far = Math.max(frame.radius * look.reach, 1e-3);
    camera.position.set(0, -frame.radius * 0.002, 0);
    camera.updateProjectionMatrix();
    plane.scale.set(extent, 1, extent);
    gl.setRenderTarget(layer.target);
    gl.render(scene, camera);
    blurLayer(kit, gl, layer, look.blur / look.resolution);
    blurLayer(kit, gl, layer, (look.blur * 0.4) / look.resolution);
  }
  scene.overrideMaterial = override;
  scene.background = background;
  restoreOverlays();
  kit.group.visible = true;
  gl.setRenderTarget(previousTarget);
  gl.setClearColor(savedClear, clearAlpha);
}

/**
 * Duas sombras de contato no tamanho da peça (pegada e raio do enquadramento): uma curta e densa onde ela
 * encosta, outra larga e macia. Renderizadas só depois de uma troca (`stamp`), nunca a cada quadro; quando
 * a peça se move sozinha (`follow`: almofada virando), a sombra acompanha até o fim do movimento.
 */
function StudioShadows({ framingRef, stamp, dark, follow }: { framingRef: MutableRefObject<Framing | null>; stamp: string; dark: boolean; follow: boolean }) {
  const holder = useRef<THREE.Group>(null);
  const kit = useRef<ShadowKit | null>(null);
  const followUntil = useRef(0);
  const followed = useRef(follow);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    const next = createShadowKit(dark);
    node.add(next.group);
    kit.current = next;
    invalidate();
    return () => {
      node.remove(next.group);
      next.dispose();
      if (kit.current === next) kit.current = null;
    };
  }, [dark, invalidate]);

  useEffect(() => {
    if (kit.current) kit.current.pending = SHADOW_FRAMES;
    invalidate();
  }, [stamp, invalidate]);

  useEffect(() => {
    if (followed.current === follow) return;
    followed.current = follow;
    followUntil.current = performance.now() + FLIP_MS + 120;
    invalidate();
  }, [follow, invalidate]);

  useFrame((state) => {
    const active = kit.current;
    const frame = framingRef.current;
    if (!active || !frame) return;
    const following = followUntil.current > 0 && performance.now() < followUntil.current;
    if (!following && followUntil.current > 0) {
      // Fim do movimento: mais alguns quadros para a sombra pousar na pose final.
      followUntil.current = 0;
      active.pending = Math.max(active.pending, SHADOW_FRAMES);
    }
    if (!following && active.pending <= 0) return;
    if (!following) active.pending -= 1;
    renderShadows(active, state.gl, state.scene, frame);
    if (following || active.pending > 0) state.invalidate();
  });

  return <group ref={holder} />;
}

/* ---------------------------------------------------------------------------------------------- */
/* Snapshot                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Ângulo do carrinho: 3/4 à direita da vista inicial da peça e pelo menos um pouco acima, respeitando
 * `userData.view` (peças deitadas continuam vistas de cima).
 */
function captureDirection(root: THREE.Object3D, turn = 0): THREE.Vector3 {
  const { elevation, azimuth = 0 } = viewHint(root);
  const e = Math.max(THREE.MathUtils.clamp(elevation ?? 0, 0, 1.2), CAPTURE_ELEVATION);
  const a = azimuth + CAPTURE_AZIMUTH + turn;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

/** `backdrop` null = fundo transparente (foto de catálogo). */
type SnapshotOptions = { fixedAngle: boolean; framing: Framing | null; backdrop: Backdrop | null; format: "jpeg" | "png"; turn?: number };

function snapshot(state: RootState, { fixedAngle, framing, backdrop, format, turn: extraTurn = 0 }: SnapshotOptions): string | null {
  const { gl, scene, camera } = state;
  const controls = state.controls as unknown as OrbitControlsImpl | null;
  const target = controls?.target ?? new THREE.Vector3();
  const rig = scene.getObjectByName(RIG_NAME);
  scene.traverse(hideOverlay);
  const saved = camera.position.clone();
  if (fixedAngle) {
    // Sempre a peça inteira, mesmo que o cliente tenha dado zoom. No ambiente: a vista composta da sala.
    const center = framing?.center ?? target;
    const distance = framing?.distance ?? saved.distanceTo(target);
    camera.position.copy(center).addScaledVector(framing?.capture ?? captureDirection(scene, extraTurn), distance);
    camera.lookAt(center);
  }
  // A luz do estúdio gira com a câmera; a do ambiente é fixa.
  const turn = !framing?.fixed;
  if (turn) orientStudio(scene, rig, cameraAzimuth(camera, target));
  gl.render(scene, camera);
  const source = gl.domElement;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (ctx) {
    // O mesmo ciclorama da tela por baixo do canvas transparente (sem ele, a foto sai com fundo transparente).
    if (backdrop) paintBackdrop(ctx, out.width, out.height, backdrop, document.documentElement);
    ctx.drawImage(source, 0, 0);
  }
  restoreOverlays();
  camera.position.copy(saved);
  camera.lookAt(target);
  if (turn) orientStudio(scene, rig, cameraAzimuth(camera, target));
  gl.render(scene, camera);
  if (!ctx) return null;
  return format === "png" ? out.toDataURL("image/png") : out.toDataURL("image/jpeg", 0.85);
}

type CaptureProps = {
  captureRef?: MutableRefObject<CaptureFn | null>;
  shotRef: MutableRefObject<ShotFn | null>;
  framingRef: MutableRefObject<Framing | null>;
  /** No foco na arte, a foto do carrinho é a arte de frente (a placa acesa), não a peça inteira. */
  focusFramingRef: MutableRefObject<Framing | null>;
  backdrop: Backdrop;
};

function Capture({ captureRef, shotRef, framingRef, focusFramingRef, backdrop }: CaptureProps) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const framing = () => focusFramingRef.current ?? framingRef.current;
    const shot: ShotFn = (format) => snapshot(get(), { fixedAngle: format === "jpeg", framing: framing(), backdrop, format });
    const capture: CaptureFn = (options) =>
      options?.transparent ? snapshot(get(), { fixedAngle: true, framing: framing(), backdrop: null, format: "png", turn: options.turn }) : shot("jpeg");
    shotRef.current = shot;
    const previous = captureRef ? captureRef.current : null;
    if (captureRef) captureRef.current = capture;
    return () => {
      if (shotRef.current === shot) shotRef.current = null;
      if (captureRef && captureRef.current === capture) captureRef.current = previous;
    };
  }, [get, captureRef, shotRef, framingRef, focusFramingRef, backdrop]);
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

/* ---------------------------------------------------------------------------------------------- */
/* Palco                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

type StageProps = {
  spec: MockupSpec;
  art: ArtSettings;
  label: string;
  showDims: boolean;
  modelKey: string;
  /** Muda quando qualquer opção muda: reapoia a peça no chão e refaz a sombra. */
  shadowKey: string;
  dark: boolean;
  resetToken: number;
  reducedMotion: boolean;
  ready: boolean;
  onReady: (kind: MockupSpec["kind"]) => void;
  /** Enquadramento atual, compartilhado com o snapshot. */
  framingRef: MutableRefObject<Framing | null>;
  /** Ambiente mostrado (null = estúdio). */
  env: RoomEnvironment | null;
  /** Cotas da peça no ambiente (no estúdio, o próprio modelo desenha as dele). */
  roomDims: boolean;
  /** A cena nova (estúdio ou sala) já compilou e está enquadrada. */
  onSceneReady: (key: string) => void;
  /** Verso à mostra (almofada virando): a sombra de contato acompanha o movimento. */
  back: boolean;
  /** Foco na arte (> 0) e o pedido atual: um número novo refaz a aproximação; 0 volta à vista inicial. */
  focus: number;
  /** Enquadramento da arte em foco (null fora do foco), compartilhado com o snapshot. */
  focusFramingRef: MutableRefObject<Framing | null>;
};

/** Mudança de raio ou centro (× raio) a partir da qual a câmera reenquadra a peça. */
const REFRAME_TOLERANCE = 0.025;

function Stage({ spec, art, label, showDims, modelKey, shadowKey, dark, resetToken, reducedMotion, ready, onReady, framingRef, env, roomDims, onSceneReady, back, focus, focusFramingRef }: StageProps) {
  const group = useRef<THREE.Group>(null);
  const roomRef = useRef<THREE.Group>(null);
  const dimsRef = useRef<THREE.Group>(null);
  const sceneKey = env?.key ?? "studio";
  const framedScene = useRef(sceneKey);
  // A arte leva o tipo da peça (escolhe o template) e as cores do LED (neon).
  // Cores de LED escolhidas pelo cliente (neon) valem mais que a cor da opção do produto.
  const renderArt = useMemo(
    () => ({ ...art, kind: spec.kind, ledColors: art.ledColors?.length ? art.ledColors : spec.ledColors, surface: spec.baseColor }),
    [art, spec.kind, spec.ledColors, spec.baseColor],
  );
  const get = useThree((state) => state.get);
  const hasControls = useThree((state) => Boolean(state.controls));
  const invalidate = useThree((state) => state.invalidate);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const framedKey = useRef<string | null>(null);
  const tween = useRef<Tween | null>(null);
  const handledReset = useRef(resetToken);
  const introDone = useRef(false);
  // Foco atual para o enquadramento abaixo (que não roda a cada troca de foco) e o último pedido atendido.
  const focusRef = useRef(focus);
  const handledFocus = useRef(0);
  useLayoutEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  // Estúdio: apoia a peça no chão (y = 0), centraliza em x/z e enquadra a câmera na vista inicial.
  // Ambiente: tira o 3/4 da peça, escala e move a sala em volta dela e enquadra peça + móvel de escala.
  // Roda a cada opção (variante, alça, profundidade… mudam a altura da peça), mas só move a câmera quando
  // o tamanho ou a cena mudam de verdade.
  useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    const camera = get().camera as THREE.PerspectiveCamera;
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    let next: Framing | null = null;
    const room = roomRef.current;
    if (env && room) {
      if (camera.fov !== ROOM_FOV) {
        camera.fov = ROOM_FOV;
        camera.updateProjectionMatrix();
      }
      const placed = placeInRoom(root, room, env, spec);
      if (placed) {
        const dims = dimsRef.current;
        if (dims && placed.dims) {
          dims.position.copy(placed.dims.position);
          // Deitadas no tapete (giradas como a peça) ou de pé na frente da peça.
          dims.rotation.set(placed.dims.flat ? -Math.PI / 2 : 0, placed.dims.flat ? 0 : placed.dims.yaw, placed.dims.flat ? placed.dims.yaw : 0);
          dims.scale.setScalar(placed.unitsPerCm);
        }
        const size = placed.box.getSize(new THREE.Vector3());
        next = {
          center: placed.center,
          distance: fitDistance(placed.radius, camera, ROOM_MARGIN),
          home: placed.home,
          radius: placed.radius,
          footprint: Math.max(size.x, size.z, 1e-3),
          height: Math.max(size.y, 1e-3),
          margin: ROOM_MARGIN,
          zoom: ROOM_ZOOM,
          capture: placed.home.clone(),
          fixed: true,
        };
      }
    }
    if (!next) {
      if (camera.fov !== STUDIO_FOV) {
        camera.fov = STUDIO_FOV;
        camera.updateProjectionMatrix();
      }
      root.rotation.set(0, 0, 0);
      root.scale.set(1, 1, 1);
      root.position.set(0, 0, 0);
      const raw = measureBox(root);
      if (raw.isEmpty()) return;
      const center = raw.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -raw.min.y, -center.z);
      const hint = viewHint(root);
      next = frameBox(measureBox(root), camera, homeDirection(hint), THREE.MathUtils.clamp(hint.distance ?? 1, 0.5, 1.5));
    }
    // Modelo com uma arte em foco (a fachada): o zoom chega perto dela, e em foco a câmera fica de frente para ela.
    const focusFrame = env ? null : frameFocus(root, camera, next);
    if (focusFrame) next.zoom = [Math.min(next.zoom[0], (focusFrame.distance * FOCUS_MIN_ZOOM) / next.distance), next.zoom[1]];
    const focusing = focusRef.current > 0 && focusFrame !== null;
    focusFramingRef.current = focusing ? focusFrame : null;
    const goal = focusing ? focusFrame : next;
    const frameKey = `${modelKey}|${sceneKey}`;
    const previous = framingRef.current;
    const sameModel = previous !== null && framedKey.current === frameKey;
    const resized =
      previous === null ||
      Math.abs(next.radius - previous.radius) > previous.radius * REFRAME_TOLERANCE ||
      next.center.distanceTo(previous.center) > previous.radius * REFRAME_TOLERANCE ||
      next.home.distanceTo(previous.home) > 1e-3;
    // Troca de cena (estúdio ↔ ambiente, outra sala): o canvas está apagado, a câmera vai direto.
    const sceneChanged = framedScene.current !== sceneKey;
    framedScene.current = sceneKey;
    framingRef.current = next;
    framedKey.current = frameKey;
    camera.near = next.distance / 50;
    camera.far = next.distance * 20;
    camera.updateProjectionMatrix();
    if (sameModel && !resized) {
      // Cor, acabamento ou outra opção que não muda o tamanho: a câmera fica onde o cliente deixou.
      if (controls) {
        controls.target.copy(goal.center);
        controls.minDistance = next.distance * next.zoom[0];
        controls.maxDistance = next.distance * next.zoom[1];
        controls.update();
      }
      invalidate();
      return;
    }
    // Outra medida/forma com a peça já na tela: desliza até a nova vista em vez de saltar.
    const glide = previous !== null && controls !== null && !reducedMotion && !sceneChanged;
    const fromOffset = camera.position.clone().sub(controls?.target ?? goal.center);
    const homePos = goal.center.clone().addScaledVector(goal.home, goal.distance);
    if (glide && previous) {
      camera.position.copy(goal.center).addScaledVector(fromOffset, next.distance / previous.distance);
      tween.current = makeTween(camera.position, goal.center, homePos, goal.center, RESET_SECONDS, 3);
    } else {
      camera.position.copy(homePos);
      tween.current = null;
    }
    camera.lookAt(goal.center);
    if (controls) {
      controls.target.copy(goal.center);
      controls.minDistance = next.distance * next.zoom[0];
      controls.maxDistance = next.distance * next.zoom[1];
      controls.update();
    }
    invalidate();
  }, [modelKey, shadowKey, sceneKey, env, spec, hasControls, reducedMotion, framingRef, focusFramingRef, get, invalidate]);

  // Cena nova (sala ou volta ao estúdio) depois da primeira: compila os materiais novos com o canvas
  // apagado e só então avisa para ele voltar.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const { gl, scene, camera } = get();
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        onSceneReady(sceneKey);
        invalidate();
      });
    return () => {
      alive = false;
    };
  }, [sceneKey, ready, get, onSceneReady, invalidate]);

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

  // Entrada: na primeira vez que a peça aparece, a câmera chega girando de um ângulo mais aberto.
  useLayoutEffect(() => {
    if (!ready || introDone.current) return;
    introDone.current = true;
    const goal = framingRef.current;
    const camera = get().camera;
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    if (reducedMotion || !goal || !controls) return;
    const homePos = goal.center.clone().addScaledVector(goal.home, goal.distance);
    const start = new THREE.Spherical().setFromVector3(goal.home.clone().multiplyScalar(goal.distance * INTRO_ORBIT.zoom));
    if (goal.fixed) {
      // Na sala o giro é limitado: a entrada é só uma aproximação.
      start.radius = goal.distance * 1.15;
    } else {
      start.theta += INTRO_ORBIT.azimuth;
      start.phi = THREE.MathUtils.clamp(start.phi + INTRO_ORBIT.polar, 0.4, Math.PI / 1.9);
    }
    camera.position.setFromSpherical(start).add(goal.center);
    camera.lookAt(goal.center);
    controls.target.copy(goal.center);
    controls.update();
    tween.current = makeTween(camera.position, goal.center, homePos, goal.center, INTRO_SECONDS, 4);
    invalidate();
  }, [ready, reducedMotion, framingRef, get, invalidate]);

  // Tela cheia ou outro tamanho: mantém a direção e só refaz a distância de enquadramento.
  useEffect(() => {
    const goal = framingRef.current;
    if (!goal || width <= 0 || height <= 0) return;
    const camera = get().camera as THREE.PerspectiveCamera;
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    const distance = fitDistance(goal.radius, camera, goal.margin);
    if (!Number.isFinite(distance) || Math.abs(distance - goal.distance) < goal.distance * 0.01) return;
    const scale = distance / goal.distance;
    const target = controls?.target ?? goal.center;
    camera.position.sub(target).multiplyScalar(scale).add(target);
    goal.distance = distance;
    // Em foco, a arte é reenquadrada para a tela nova (a foto do carrinho usa este enquadramento).
    const root = group.current;
    if (focusFramingRef.current && root) focusFramingRef.current = frameFocus(root, camera, goal);
    camera.near = distance / 50;
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    const active = tween.current;
    if (active) {
      active.from.radius *= scale;
      active.to.radius *= scale;
    }
    if (controls) {
      controls.minDistance = distance * goal.zoom[0];
      controls.maxDistance = distance * goal.zoom[1];
      controls.update();
    }
    invalidate();
  }, [width, height, framingRef, focusFramingRef, get, invalidate]);

  // "Centralizar" volta à vista inicial (em foco, à arte de frente).
  useEffect(() => {
    if (resetToken === handledReset.current) return;
    handledReset.current = resetToken;
    const goal = focusFramingRef.current ?? framingRef.current;
    const { camera } = get();
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    if (!goal || !controls) return;
    const toPos = goal.center.clone().addScaledVector(goal.home, goal.distance);
    if (reducedMotion) {
      tween.current = null;
      camera.position.copy(toPos);
      controls.target.copy(goal.center);
      controls.update();
      invalidate();
      return;
    }
    tween.current = makeTween(camera.position, controls.target, toPos, goal.center, RESET_SECONDS, 3);
    invalidate();
  }, [resetToken, reducedMotion, framingRef, focusFramingRef, get, invalidate]);

  // Foco na arte: cada pedido novo (clique num estilo) leva a câmera de frente para a parte em foco, em órbita
  // (aproxima e endireita ao mesmo tempo); 0 volta à vista inicial. Na primeira aparição em foco, esta ida
  // substitui a entrada.
  useEffect(() => {
    if (!ready || focus === handledFocus.current) return;
    handledFocus.current = focus;
    const root = group.current;
    const store = framingRef.current;
    const camera = get().camera as THREE.PerspectiveCamera;
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    if (!root || !store || !controls) return;
    const frame = focus > 0 && !env ? frameFocus(root, camera, store) : null;
    focusFramingRef.current = frame;
    const goal = frame ?? store;
    const toPos = goal.center.clone().addScaledVector(goal.home, goal.distance);
    if (reducedMotion) {
      tween.current = null;
      camera.position.copy(toPos);
      controls.target.copy(goal.center);
      controls.update();
    } else {
      tween.current = makeTween(camera.position, controls.target, toPos, goal.center, frame ? FOCUS_SECONDS : UNFOCUS_SECONDS, 3);
    }
    invalidate();
  }, [focus, ready, env, reducedMotion, framingRef, focusFramingRef, get, invalidate]);

  // Quem arrasta assume a câmera: a entrada ou o "centralizar" param na hora.
  useEffect(() => {
    const controls = get().controls as unknown as OrbitControlsImpl | null;
    if (!controls) return;
    const cancel = () => {
      tween.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [hasControls, get]);

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
    active.t = Math.min(1, active.t + delta / active.seconds);
    const k = 1 - Math.pow(1 - active.t, active.power);
    orbit.radius = THREE.MathUtils.lerp(active.from.radius, active.to.radius, k);
    orbit.phi = THREE.MathUtils.lerp(active.from.phi, active.to.phi, k);
    orbit.theta = active.from.theta + active.turn * k;
    controls.target.lerpVectors(active.fromTarget, active.toTarget, k);
    state.camera.position.setFromSpherical(orbit).add(controls.target);
    controls.update();
    if (active.t >= 1) tween.current = null;
    else invalidate();
  });

  return (
    <>
      <group ref={group} visible={ready}>
        <MockupModel key={modelKey} spec={spec} art={renderArt} label={label} showDims={env ? false : showDims} />
      </group>
      {env ? (
        <>
          {/* A sala é desenhada em metros; o posicionamento escala o grupo para a escala da peça. */}
          <group ref={roomRef} visible={ready}>
            <RoomScene key={env.key} env={env} />
          </group>
          <group ref={dimsRef} visible={ready && roomDims}>
            {roomDims && <RoomDims widthCm={spec.widthCm} heightCm={spec.heightCm} labels={sizeLabels(spec)} light={env.night} widthOnTop={env.placement.spot === "paper"} />}
          </group>
        </>
      ) : (
        <StudioShadows framingRef={framingRef} stamp={`${shadowKey}|${ready}`} dark={dark} follow={back} />
      )}
    </>
  );
}

/**
 * Luz de estúdio em três pontos que acompanha a câmera (prato giratório): key em softbox quente no alto à
 * esquerda, fill frio e baixo à direita, rim atrás recortando a silhueta, mais um teto e uma faixa frontal
 * longa que vira o reflexo horizontal clássico em peças brilhantes. No neon, o ambiente pega as cores do LED.
 */
const StudioLights = memo(function StudioLights({ dark, glowA, glowB, dusk }: { dark: boolean; glowA: string; glowB: string; dusk: boolean }) {
  const rig = useRef<THREE.Group>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  // 0 = dia, 1 = fim de tarde (foco na arte): as luzes do estúdio caem em ~1 s e voltam do mesmo jeito.
  const evening = useRef(dusk ? 1 : 0);
  const animate = useAnimate();
  const invalidate = useThree((state) => state.invalidate);
  const k = dark ? 0.26 : 1;
  const skyBase = dark ? 0.1 : 0.5;
  const environmentBase = dark ? 0.45 : 0.9;
  useEffect(() => {
    invalidate();
  }, [dusk, invalidate]);
  useFrame((state, delta) => {
    const controls = state.controls as unknown as OrbitControlsImpl | null;
    orientStudio(state.scene, rig.current, cameraAzimuth(state.camera, controls?.target ?? null));
    const target = dusk ? 1 : 0;
    const level = animate ? evening.current + (target - evening.current) * (1 - Math.exp(-Math.min(delta, 0.1) * DUSK_RATE)) : target;
    evening.current = Math.abs(target - level) < 0.002 ? target : level;
    if (evening.current !== target) state.invalidate();
    const e = evening.current;
    if (sky.current) sky.current.intensity = skyBase * (1 - e * (1 - DUSK_SKY));
    rig.current?.children.forEach((light, i) => {
      if (light instanceof THREE.DirectionalLight) light.intensity = (RIG_INTENSITY[i] ?? 0) * k * (1 - e * (1 - DUSK_LIGHTS));
    });
    state.scene.environmentIntensity = environmentBase * (1 - e * (1 - DUSK_ENVIRONMENT));
  });
  return (
    <>
      <hemisphereLight ref={sky} color="#fffaf2" groundColor="#d8d4cf" intensity={skyBase} />
      <group ref={rig} name={RIG_NAME}>
        <directionalLight position={[-3.2, 4.6, 4.2]} intensity={RIG_INTENSITY[0] * k} color="#fff5ea" />
        <directionalLight position={[4.2, 1.4, 3]} intensity={RIG_INTENSITY[1] * k} color="#eef3ff" />
        <directionalLight position={[1.6, 4, -5]} intensity={RIG_INTENSITY[2] * k} />
        <directionalLight position={[-3.6, 1.6, -4]} intensity={RIG_INTENSITY[3] * k} />
      </group>
      <Environment resolution={256} environmentIntensity={environmentBase}>
        {/* Key: softbox grande e quente. */}
        <Lightformer form="rect" intensity={2.4 * k} position={[-4.5, 4.5, 4.5]} scale={[4.5, 6, 1]} color="#fff4e6" />
        {/* Fill: rebatedor frio e mais fraco. */}
        <Lightformer form="rect" intensity={0.9 * k} position={[5.5, 1.5, 3.5]} scale={[3, 5, 1]} color="#f0f5ff" />
        {/* Rim: duas réguas atrás da peça. */}
        <Lightformer form="rect" intensity={2.2 * k} position={[-4, 3, -5]} scale={[1.2, 8, 1]} />
        <Lightformer form="rect" intensity={1.6 * k} position={[4.5, 2.5, -4.5]} scale={[1.2, 8, 1]} />
        {/* Teto e faixa frontal (reflexo horizontal). */}
        <Lightformer form="rect" intensity={1 * k} position={[0, 8, 0]} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={0.6 * k} position={[0, 0.8, 7]} scale={[9, 2.5, 1]} />
        {/* Rebatimento quente do chão. */}
        <Lightformer form="rect" intensity={0.35 * k} position={[0, -4, 1]} scale={[10, 10, 1]} color="#fff0e4" />
        {dark && (
          <>
            <Lightformer form="circle" intensity={1.6} position={[-5, 1, -2]} scale={4} color={glowA} />
            <Lightformer form="circle" intensity={1.2} position={[5, 1, -2]} scale={4} color={glowB} />
          </>
        )}
      </Environment>
    </>
  );
});

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
      {image && <FotoProduto src={image} alt={label} sizes="(max-width: 1024px) 90vw, 560px" respiro="p-8" />}
      <div role="status" className="relative z-10 m-3 mt-auto rounded-control bg-white/90 p-4 text-center shadow-float ring-1 ring-ink/5 backdrop-blur-md">
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

/** Nome de arquivo sem acento nem espaço: "Caneca Mágica 325ml" → "caneca-magica-325ml-mockup-3d.png". */
function fileName(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "mockup"}-mockup-3d.png`;
}

type SceneChoice = { mode: "studio" | "room"; room: RoomId | null };

const STUDIO_CHOICE: SceneChoice = { mode: "studio", room: null };

/** Sala efetiva da escolha: a pedida, se o tipo tem essa sala; senão a primeira do tipo. */
function roomOf(choice: SceneChoice, rooms: RoomId[]): RoomId | null {
  if (choice.mode !== "room" || !rooms.length) return null;
  return choice.room && rooms.includes(choice.room) ? choice.room : rooms[0];
}

/** Cotas no ambiente: só onde a peça tem frente plana para medir (parede, papel, chão, tampo). */
const DIM_SPOTS = new Set(["wall", "paper", "window", "towel", "top", "floor", "stand"]);

export default function MockupViewer({ spec, art, label, captureRef, fallbackImage, side, focus = 0, className = "" }: ViewerProps) {
  const surface = useRef<HTMLDivElement>(null);
  const shot = useRef<ShotFn | null>(null);
  const framingRef = useRef<Framing | null>(null);
  const focusFramingRef = useRef<Framing | null>(null);
  const visible = useInViewport(surface);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const canFullscreen = useFullscreenSupport();
  const fullscreen = useIsFullscreen(surface);
  const [supported] = useState(canUseWebGL);
  const [attempt, setAttempt] = useState(0);
  const [lost, setLost] = useState(false);
  const [readyKind, setReadyKind] = useState<MockupSpec["kind"] | null>(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [dims, setDims] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  // Cenário pedido (botões) e cenário na tela: a troca espera o canvas apagar.
  const [choice, setChoice] = useState<SceneChoice>(STUDIO_CHOICE);
  const [shown, setShown] = useState<SceneChoice>(STUDIO_CHOICE);
  const [fading, setFading] = useState(false);
  // Lado escolhido no botão "Ver verso"; vale enquanto a página não mudar o `side`.
  const [manualSide, setManualSide] = useState<{ back: boolean; prop: ViewerSide | undefined; kind: MockupSpec["kind"] } | null>(null);
  const idleTimer = useRef<number | null>(null);
  const switchTimer = useRef<number | null>(null);
  const shownKey = useRef("studio");

  const info = KIND_INFO[spec.kind];
  const dark = info.scene === "dark";
  const ready = readyKind === spec.kind;
  const rooms = useMemo(() => roomsFor(spec), [spec]);
  const shownRoom = roomOf(shown, rooms);
  const env = useMemo(() => (shownRoom ? environmentFor(spec, shownRoom) : null), [shownRoom, spec]);
  const sceneKey = env?.key ?? "studio";
  const chosenRoom = roomOf(choice, rooms);
  const inRoom = chosenRoom !== null;
  const showDims = dims && info.dims;
  const roomDims = showDims && env !== null && DIM_SPOTS.has(env.placement.spot);
  // Na sala a peça fica parada (a luz e o móvel não giram); a órbita é limitada. A fachada também (KIND_INFO.orbit).
  const orbit = info.orbit;
  // Foco na arte: a câmera fica de frente para ela (sem giro), com o estúdio no fim de tarde.
  const focusOn = focus > 0 && !env;
  const autoRotate = ready && visible && !paused && !interacting && !reducedMotion && !env && !orbit && !focusOn;
  const modelKey = `${spec.kind}-${spec.variant ?? ""}-${spec.widthCm}-${spec.heightCm}-${spec.depthCm}-${spec.shape}-${spec.sleeveless}-${spec.grommets}`;
  const shadowKey = useMemo(() => JSON.stringify(spec), [spec]);
  const canFlip = BACK_VIEW_KINDS.has(spec.kind);
  const showBack = canFlip && (manualSide && manualSide.prop === side && manualSide.kind === spec.kind ? manualSide.back : side === "back");

  // Fundo de estúdio: no neon, o brilho tem as cores do LED escolhidas (as do cliente valem mais que a
  // da opção do produto, como na arte). No ambiente, a cor da parede.
  const ledSource = art.ledColors?.length ? art.ledColors : spec.ledColors;
  const ledKey = dark ? ledSource.filter((c) => HEX.test(c)).join(",") : "";
  const roomTone = env ? roomBackdropColor(env) : null;
  const backdrop = useMemo<Backdrop>(() => (roomTone ? { base: { color: roomTone }, layers: [] } : studioBackdrop(dark, ledKey ? ledKey.split(",") : [])), [roomTone, dark, ledKey]);
  const background = useMemo(() => backdropCss(backdrop), [backdrop]);
  const leds = ledKey ? ledKey.split(",") : DEFAULT_GLOW;
  const glowA = leds[0] ?? DEFAULT_GLOW[0];
  const glowB = leds[1] ?? glowA;
  const sceneMode = useMemo<SceneMode>(
    () => ({ room: env ? env.placement.surface : null, back: showBack, motion: !reducedMotion, focus: focusOn }),
    [env, showBack, reducedMotion, focusOn],
  );

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
      if (switchTimer.current) window.clearTimeout(switchTimer.current);
    },
    [],
  );
  useEffect(() => {
    shownKey.current = sceneKey;
  }, [sceneKey]);

  /** Troca de cenário: apaga o canvas, troca a cena e acende de novo quando ela compilar. */
  const pickScene = useCallback(
    (next: SceneChoice) => {
      setChoice(next);
      if (switchTimer.current) window.clearTimeout(switchTimer.current);
      if (reducedMotion) {
        setShown(next);
        return;
      }
      setFading(true);
      switchTimer.current = window.setTimeout(() => {
        switchTimer.current = null;
        const room = roomOf(next, rooms);
        const key = room ? environmentFor(spec, room).key : "studio";
        // Mesma cena de antes (ida e volta rápida): nada para compilar, só acende.
        if (key === shownKey.current) setFading(false);
        setShown(next);
      }, FADE_MS);
    },
    [reducedMotion, rooms, spec],
  );
  const onSceneReady = useCallback(() => setFading(false), []);

  const toggleSide = useCallback(() => {
    setManualSide({ back: !showBack, prop: side, kind: spec.kind });
  }, [showBack, side, spec.kind]);

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
    setFading(false);
    setAttempt((a) => a + 1);
  }, []);

  const download = useCallback(() => {
    const url = shot.current?.("png");
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(label);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [label]);

  const toggleFullscreen = useCallback(() => {
    const node = surface.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else node.requestFullscreen().catch(() => undefined);
  }, []);

  const failed = !supported || lost;
  const glass = dark ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-white/70 text-ink ring-1 ring-ink/5";
  const view = env?.view;

  return (
    <div
      ref={surface}
      data-kind={spec.kind}
      data-ready={ready}
      data-scene={env ? "room" : "studio"}
      data-room={env?.preset.id}
      onPointerDown={() => {
        setArmed(true);
        setEngaged(true);
      }}
      onPointerLeave={() => setArmed(false)}
      className={`relative isolate overflow-hidden rounded-card [&:fullscreen]:rounded-none ${dark ? "bg-night" : "bg-mist"} ${className}`}
      style={{ background }}
    >
      {/* Foco na arte: o fundo vira fim de tarde (por baixo do canvas transparente). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none"
        style={{ background: DUSK_CSS, opacity: focusOn ? 1 : 0 }}
      />
      {failed ? (
        <ViewerFallback image={fallbackImage} label={label} onRetry={supported ? retry : undefined} />
      ) : (
        <MockupBoundary key={attempt} fallback={<ViewerFallback image={fallbackImage} label={label} onRetry={retry} />}>
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ position: [0, 0.6, 6], fov: STUDIO_FOV }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }}
            onCreated={onCreated}
            role="img"
            aria-label={env ? `Mockup 3D: ${label} — ambiente ${PRESETS[env.preset.id].label.toLowerCase()}` : `Mockup 3D: ${label}`}
            className={`motion-safe:transition-opacity motion-safe:duration-200 ${fading ? "opacity-0" : "opacity-100"}`}
          >
            <AnimateContext.Provider value={visible && !reducedMotion}>
              <SceneContext.Provider value={sceneMode}>
                <Stage
                  spec={spec}
                  art={art}
                  label={label}
                  showDims={showDims}
                  modelKey={modelKey}
                  shadowKey={shadowKey}
                  dark={dark}
                  resetToken={resetToken}
                  reducedMotion={reducedMotion}
                  ready={ready}
                  onReady={setReadyKind}
                  framingRef={framingRef}
                  env={env}
                  roomDims={roomDims}
                  onSceneReady={onSceneReady}
                  back={showBack}
                  focus={focus}
                  focusFramingRef={focusFramingRef}
                />
              </SceneContext.Provider>
              {/* Depois do palco: a luz do estúdio segue a câmera já movida neste quadro; a da sala é fixa. */}
              {env ? <RoomLights night={env.night} wall={roomBackdropColor(env)} /> : <StudioLights dark={dark} glowA={glowA} glowB={glowB} dusk={focusOn} />}
              <OrbitControls
                makeDefault
                enablePan={false}
                enableZoom={coarse || armed}
                autoRotate={autoRotate}
                minPolarAngle={view ? view.minPolar : (orbit?.minPolar ?? 0.35)}
                maxPolarAngle={view ? view.maxPolar : (orbit?.maxPolar ?? Math.PI / 1.85)}
                minAzimuthAngle={view ? view.azimuth - view.range : orbit ? -orbit.range : -Infinity}
                maxAzimuthAngle={view ? view.azimuth + view.range : orbit ? orbit.range : Infinity}
                onStart={onInteractStart}
                onEnd={onInteractEnd}
              />
              <SpinClock active={autoRotate} />
              <TouchPolicy />
              <Capture captureRef={captureRef} shotRef={shot} framingRef={framingRef} focusFramingRef={focusFramingRef} backdrop={focusOn ? DUSK_BACKDROP : backdrop} />
            </AnimateContext.Provider>
          </Canvas>
        </MockupBoundary>
      )}

      {!failed && (
        // Depois da dissolução o skeleton fica invisible: sai da árvore de acessibilidade e para de pintar o brilho.
        <div
          aria-hidden={ready}
          className={`pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-700 ${ready ? "invisible opacity-0" : "visible opacity-100"}`}
        >
          <MockupSkeleton dark={dark} />
        </div>
      )}

      {!failed && ready && fading && (
        // Só aparece se a troca demorar (aparelho lento compilando a sala): o atraso esconde trocas rápidas.
        <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold shadow-float backdrop-blur-xl motion-safe:animate-fade-up motion-safe:[animation-delay:350ms] ${glass}`}>
            {inRoom ? "Montando o ambiente…" : "Voltando ao estúdio…"}
          </span>
        </div>
      )}

      {!failed && ready && (
        <>
          <div
            className={`pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2 motion-safe:animate-fade-up ${rooms.length || canFlip ? "max-w-[calc(100%-11.5rem)]" : ""}`}
          >
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide backdrop-blur-xl ${glass}`}>
              <span className="flex h-2 w-3.5 overflow-hidden rounded-full" aria-hidden>
                <span className="flex-1 bg-red" />
                <span className="flex-1 bg-sun" />
                <span className="flex-1 bg-cyan" />
                <span className="flex-1 bg-lime" />
              </span>
              3D
            </span>
            <span
              aria-hidden={engaged}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-xl transition-opacity duration-700 ${glass} ${engaged ? "opacity-0" : "opacity-100"}`}
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <ellipse cx="12" cy="12" rx="9" ry="3.6" />
                <path d="M16.5 6.2 19 8.6l-3 1" />
              </svg>
              {coarse ? "Deslize para girar" : "Arraste para girar"}
              <span className="opacity-60">· {coarse ? "pinça para zoom" : "clique e role para zoom"}</span>
            </span>
          </div>

          {(rooms.length > 0 || canFlip) && (
            <div className={`absolute right-3 top-3 flex flex-col items-end gap-2 motion-safe:animate-fade-up ${dark ? "on-dark" : ""}`}>
              {rooms.length > 0 && (
                <div role="group" aria-label="Cenário do mockup" className={`flex items-center gap-0.5 rounded-full p-1 shadow-float backdrop-blur-xl ${glass}`}>
                  <SceneButton dark={dark} active={!inRoom} onClick={() => inRoom && pickScene({ mode: "studio", room: chosenRoom })}>
                    Estúdio
                  </SceneButton>
                  <SceneButton dark={dark} active={inRoom} onClick={() => !inRoom && pickScene({ mode: "room", room: choice.room })}>
                    Ambiente
                  </SceneButton>
                </div>
              )}
              {inRoom && chosenRoom && rooms.length > 1 && (
                <label className={`relative flex items-center rounded-full shadow-float backdrop-blur-xl ${glass}`}>
                  <span className="sr-only">Ambiente</span>
                  <select
                    value={chosenRoom}
                    onChange={(event) => pickScene({ mode: "room", room: event.target.value as RoomId })}
                    className="cursor-pointer appearance-none rounded-full bg-transparent py-1.5 pl-3 pr-8 text-[12px] font-bold"
                  >
                    {rooms.map((id) => (
                      <option key={id} value={id} className="bg-paper text-ink">
                        {PRESETS[id].label}
                      </option>
                    ))}
                  </select>
                  <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </label>
              )}
              {inRoom && chosenRoom && rooms.length === 1 && (
                <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold shadow-float backdrop-blur-xl ${glass}`}>{PRESETS[chosenRoom].label}</span>
              )}
              {canFlip && (
                <button
                  type="button"
                  onClick={toggleSide}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold shadow-float backdrop-blur-xl transition-[background-color,color,transform] duration-200 motion-safe:active:scale-95 ${
                    showBack ? (dark ? "bg-white text-ink" : "bg-ink text-white") : `${glass} ${dark ? "hover:bg-white/20" : "hover:bg-white"}`
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
                    <path d="M20 4.5v4h-4" />
                    <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
                    <path d="M4 19.5v-4h4" />
                  </svg>
                  {showBack ? "Ver frente" : "Ver verso"}
                </button>
              )}
            </div>
          )}

          <div
            role="toolbar"
            aria-label="Controles do mockup 3D"
            className={`absolute bottom-3 right-3 flex items-center gap-0.5 rounded-full p-1 shadow-float backdrop-blur-xl motion-safe:animate-fade-up ${glass}`}
          >
            {/* Com reduced motion (no ambiente ou na fachada) a peça não gira sozinha: o botão não teria efeito. */}
            {!reducedMotion && !env && !orbit && (
              <ViewerButton dark={dark} label={paused ? "Girar sozinho" : "Pausar rotação"} onClick={() => setPaused((v) => !v)}>
                {paused ? (
                  <>
                    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                    <path d="M20 4.5v4h-4" />
                  </>
                ) : (
                  <path d="M9 6.5v11M15 6.5v11" />
                )}
              </ViewerButton>
            )}
            {info.dims && (
              <ViewerButton dark={dark} label={dims ? "Ocultar medidas" : "Mostrar medidas"} onClick={() => setDims((v) => !v)} active={dims}>
                <path d="M4.5 15.5 15.5 4.5l4 4-11 11z" />
                <path d="M8 12l1.6 1.6M10.5 9.5l1.6 1.6M13 7l1.6 1.6" />
              </ViewerButton>
            )}
            <ViewerButton dark={dark} label="Voltar à vista inicial" onClick={() => setResetToken((t) => t + 1)}>
              <path d="M12 3.5 4.5 7.8v8.4l7.5 4.3 7.5-4.3V7.8z" />
              <path d="M4.5 7.8 12 12l7.5-4.2M12 12v8.5" />
            </ViewerButton>
            <span className={`mx-0.5 h-5 w-px ${dark ? "bg-white/15" : "bg-ink/10"}`} aria-hidden />
            <ViewerButton dark={dark} label="Baixar imagem" onClick={download}>
              <path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14" />
            </ViewerButton>
            {canFullscreen && (
              <ViewerButton dark={dark} label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} onClick={toggleFullscreen} active={fullscreen}>
                {fullscreen ? <path d="M9 4.5v4.5H4.5M15 4.5v4.5h4.5M9 19.5V15H4.5M15 19.5V15h4.5" /> : <path d="M4.5 9V4.5H9M19.5 9V4.5H15M4.5 15v4.5H9M19.5 15v4.5H15" />}
              </ViewerButton>
            )}
          </div>

          {/* A largura deixa espaço para a barra de controles (até 5 botões) em telas estreitas. */}
          <span
            className={`pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-15rem)] min-w-0 items-center gap-2 rounded-thumb px-2.5 py-1.5 leading-tight shadow-float backdrop-blur-xl motion-safe:animate-fade-up ${glass}`}
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8.5h16v7H4z" />
              <path d="M8 8.5v3M12 8.5v4M16 8.5v3" />
            </svg>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold">{spec.label}</span>
              <span className="block truncate text-[10px] font-medium opacity-70">
                {info.sizeIsArtArea ? "área de arte" : "tamanho"}
                {env ? " · em escala real" : ""}
              </span>
            </span>
          </span>
        </>
      )}
    </div>
  );
}

function SceneButton({ children, active, onClick, dark }: { children: ReactNode; active: boolean; onClick: () => void; dark: boolean }) {
  const tone = active ? (dark ? "bg-white text-ink" : "bg-ink text-white") : dark ? "hover:bg-white/15" : "hover:bg-ink/5";
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-[background-color,color] duration-200 ${tone}`}>
      {children}
    </button>
  );
}

function ViewerButton({ children, label, onClick, active = false, dark }: { children: ReactNode; label: string; onClick: () => void; active?: boolean; dark: boolean }) {
  const tone = active ? (dark ? "bg-white text-ink" : "bg-ink text-white") : dark ? "hover:bg-white/15" : "hover:bg-ink/5";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-full transition-[background-color,color,transform] duration-200 motion-safe:active:scale-90 ${tone}`}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
