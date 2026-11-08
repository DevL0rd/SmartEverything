export const PAGE = `
import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
import { activeShot } from './channels';
import { buildModel } from './three/build-model';
import { createContactShadow } from './three/contact-shadow';
import { createViewCamera, framedShot } from './three/framing';
import { createEmitterHalos } from './three/emitter-halo';
import { createSceneModel } from './three/scene-model';
import { createSilhouette } from './three/silhouette';
import { createStageScene, rendererEnvironment, STAGE_RIGS } from './three/stage';

const INK = { light: '#1b1b1f', dark: '#e6e6ea' };
const SOLID = 250;
const CLEAR = 8;

const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hexLuminance = (hex) => { const n = parseInt(hex.slice(1), 16); return luminance(n >> 16, (n >> 8) & 255, n & 255); };
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function touchesClear(data, w, h, x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && data[(ny * w + nx) * 4 + 3] <= CLEAR) return true;
  }
  return false;
}

function edgeContrast(data, w, h, surface) {
  let sum = 0; let count = 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < SOLID || !touchesClear(data, w, h, x, y)) continue;
    sum += ratio(luminance(data[i], data[i + 1], data[i + 2]), surface); count += 1;
  }
  return count === 0 ? null : sum / count;
}

function kitFor(spec, renderer) {
  const env = rendererEnvironment(renderer);
  const stages = { light: createStageScene('light', env), dark: createStageScene('dark', env) };
  const byLod = new Map();
  return (lod, theme) => {
    if (!byLod.has(lod)) {
      const built = buildModel(spec, { lod });
      const live = createSceneModel(spec, { lod });
      const halos = createEmitterHalos(live, theme);
      const edge = createSilhouette(live.object3d, theme);
      byLod.set(lod, { built, live, halos, edge, shadow: createContactShadow(built, theme) });
    }
    for (const other of byLod.values()) { other.live.object3d.removeFromParent(); other.shadow?.mesh.removeFromParent(); }
    const kit = byLod.get(lod);
    const scene = stages[theme].scene; scene.add(kit.live.object3d);
    kit.halos.setTheme(theme); kit.edge.setTheme(theme);
    if (kit.shadow) { kit.shadow.setTheme(theme); scene.add(kit.shadow.mesh); }
    return { ...kit, scene };
  };
}

function signalsFor(spec, cell) {
  if (cell.shot === null) return cell.signals;
  const state = Object.values(spec.states ?? {}).find((s) => activeShot(spec.shots, s)?.id === cell.shot);
  return state ?? cell.signals;
}

function drawCell(spec, cell, kitAt, renderer, view) {
  const kit = kitAt(cell.lod, cell.theme);
  kit.live.setSignals(signalsFor(spec, cell), { timeS: cell.timeS }); kit.halos.sync();
  const aspect = cell.w / cell.h; const shot = spec.shots?.find((s) => s.id === cell.shot);
  const pose = framedShot(kit.built, spec, { view: cell.view, aspect, shot, elapsedS: cell.timeS, progress: 1 });
  view.apply(pose, aspect);
  renderer.setSize(cell.w, cell.h, false); renderer.render(kit.scene, view.camera);
}

window.renderSheet = (plan) => {
  const { spec, dpr } = plan;
  const sheet = document.createElement('canvas');
  sheet.width = Math.round(plan.width * dpr); sheet.height = Math.round(plan.height * dpr);
  const ctx = sheet.getContext('2d', { willReadFrequently: true });
  ctx.scale(dpr, dpr);
  ctx.fillStyle = STAGE_RIGS.light.surface; ctx.fillRect(0, 0, plan.width, plan.height / 2);
  ctx.fillStyle = STAGE_RIGS.dark.surface; ctx.fillRect(0, plan.height / 2, plan.width, plan.height / 2);
  for (const label of plan.labels) {
    ctx.fillStyle = INK[label.theme]; ctx.font = (label.strong ? '600 14px' : '12px') + ' sans-serif';
    ctx.fillText(label.text, label.x, label.y);
  }
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, stencil: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(dpr); renderer.setClearColor(0x000000, 0); renderer.toneMapping = ACESFilmicToneMapping;
  const kitAt = kitFor(spec, renderer); const view = createViewCamera();
  const lowest = { light: null, dark: null };
  const cellCanvas = document.createElement('canvas');
  const cellCtx = cellCanvas.getContext('2d', { willReadFrequently: true });
  for (const cell of plan.cells) {
    drawCell(spec, cell, kitAt, renderer, view);
    const { width: w, height: h } = renderer.domElement;
    cellCanvas.width = w; cellCanvas.height = h;
    cellCtx.clearRect(0, 0, w, h);
    cellCtx.drawImage(renderer.domElement, 0, 0);
    const value = edgeContrast(cellCtx.getImageData(0, 0, w, h).data, w, h, hexLuminance(STAGE_RIGS[cell.theme].surface));
    if (value !== null && (lowest[cell.theme] === null || value < lowest[cell.theme])) lowest[cell.theme] = value;
    ctx.drawImage(renderer.domElement, cell.x, cell.y, cell.w, cell.h);
    ctx.fillStyle = INK[cell.theme]; ctx.font = '10px sans-serif'; ctx.fillText(cell.caption, cell.x + 4, cell.y + 12);
  }
  renderer.dispose();
  return { png: sheet.toDataURL('image/png'), light: lowest.light, dark: lowest.dark };
};
`;
