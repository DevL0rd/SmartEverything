import type { CallView } from '../call-state';

export type StageKind = 'orb' | 'camera' | 'screen-panel' | 'screen-preview' | 'home';

export function stageOf(call: CallView): StageKind {
  const source = call.sight?.source ?? null;
  if (source === 'home_camera') {
    return 'home';
  }
  if (source === 'phone_screen') {
    return 'screen-panel';
  }
  if (source === 'desktop_screen' || source === 'desktop_window') {
    return 'screen-preview';
  }
  return call.video.camera === 'off' ? 'orb' : 'camera';
}

export function isMediaStage(kind: StageKind): boolean {
  return kind !== 'orb' && kind !== 'screen-panel';
}

export function selfViewOf(call: CallView, stage: StageKind): boolean {
  return (
    stage !== 'camera' &&
    stage !== 'orb' &&
    (call.video.camera === 'on' || call.video.camera === 'paused')
  );
}

export function stageNameOf(call: CallView, stage: StageKind): string {
  if (stage === 'camera') {
    return call.video.facing === 'front'
      ? 'Front camera'
      : call.video.facing === 'back'
        ? 'Back camera'
        : 'Camera';
  }
  if (stage === 'home') {
    return call.sight?.label ?? 'Home camera';
  }
  return call.sight?.label ?? 'Your screen';
}
