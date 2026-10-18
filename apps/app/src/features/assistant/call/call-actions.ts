import { Linking } from 'react-native';
import type { EchoTestOutcome, SightFacing, SightSource } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { desktopBridge, isNative } from '../../../design/platform';
import { rawErrorText } from '../../../format/errors';
import { callState, changeCall, type CallSightRequest } from './call-state';
import { callEngine } from './engine/engine';
import type { SightStart } from './engine/call-engine';
import { sourceTitleOf } from './model/call-copy';
import type { SourcePick } from './model/call-sources';

const log = new Logger('app.assistant-call');

function report(title: string): (error: unknown) => void {
  return (error): void => {
    log.warn('call.action_failed', { title, reason: rawErrorText(error) });
    notify({ message: title, error, tone: 'critical' });
  };
}

export function attempt(title: string, run: () => void | Promise<void>): void {
  try {
    const result = run();
    if (result instanceof Promise) {
      result.catch(report(title));
    }
  } catch (error) {
    report(title)(error);
  }
}

export function startCamera(facing: SightFacing): void {
  attempt('The camera did not start', () =>
    callEngine.startSight({ source: 'phone_camera', facing }),
  );
}

function stopSource(source: SightSource): void {
  attempt('Sharing did not stop', () => {
    callEngine.stopSight(source);
  });
}

export function stopCamera(): void {
  stopSource('phone_camera');
}

export function stopSharing(): void {
  const { sight } = callState.get();
  if (sight !== null) {
    stopSource(sight.source);
  }
}

export function flipCamera(): void {
  attempt('The camera did not switch', () => callEngine.switchCamera());
}

export function chooseFacing(facing: SightFacing): void {
  if (callState.get().video.facing !== facing) {
    flipCamera();
  }
}

export function pauseCamera(paused: boolean): void {
  attempt('The video did not pause', () => {
    callEngine.pauseSight(paused);
  });
}

export function setCameraLight(on: boolean): void {
  attempt('The light did not change', () => {
    callEngine.setLight(on);
  });
}

export function interruptAssistant(): void {
  attempt('The assistant did not stop', () => {
    callEngine.interrupt();
  });
}

export function openSystemSettings(): void {
  if (isNative()) {
    attempt('The settings did not open', () => Linking.openSettings());
  }
}

function startOf(pick: Extract<SourcePick, { kind: 'desktop' }>): SightStart {
  return pick.captureId === null
    ? { source: pick.source }
    : { source: pick.source, target: pick.captureId };
}

async function startDesktop(
  pick: Extract<SourcePick, { kind: 'desktop' }>,
  still: boolean,
): Promise<void> {
  const start = startOf(pick);
  await (still ? callEngine.showThis(start) : callEngine.startSight(start));
}

function announceReplacement(pick: SourcePick): void {
  const { sight } = callState.get();
  if (sight !== null) {
    notify({
      message: `Now showing ${pick.label} instead of ${sourceTitleOf(sight.source, sight.label)}`,
    });
  }
}

export function startPick(pick: SourcePick, still: boolean): void {
  announceReplacement(pick);
  const title = still ? 'The picture was not taken' : 'Sharing did not start';
  switch (pick.kind) {
    case 'app':
      attempt(title, () =>
        still ? callEngine.showThis(pick.start) : callEngine.startSight(pick.start),
      );
      return;
    case 'home':
      attempt(title, () => {
        callEngine.watchCamera(pick.cameraId);
      });
      return;
    case 'desktop':
      attempt(title, () => startDesktop(pick, still));
  }
}

async function windowIdOf(target: string | null): Promise<string | null> {
  const sources = (await desktopBridge()?.listCaptureSources?.()) ?? [];
  const wanted = target?.toLowerCase();
  const found = sources.find(
    (source) =>
      source.kind === 'window' &&
      wanted !== undefined &&
      source.title.toLowerCase().includes(wanted),
  );
  return found?.id ?? null;
}

async function pickOfRequest(request: CallSightRequest, facing: SightFacing): Promise<SourcePick> {
  switch (request.what) {
    case 'phone_camera':
      return { kind: 'app', start: { source: 'phone_camera', facing }, label: 'Camera' };
    case 'phone_screen':
      return { kind: 'app', start: { source: 'phone_screen' }, label: 'Phone screen' };
    case 'desktop_screen':
      return { kind: 'desktop', source: 'desktop_screen', captureId: null, label: 'Screen' };
    case 'desktop_window':
      return {
        kind: 'desktop',
        source: 'desktop_window',
        captureId: await windowIdOf(request.target),
        label: request.target ?? 'Window',
      };
    case 'home_camera':
      if (request.target === null) {
        throw new Error('The assistant asked for a home camera without saying which one.');
      }
      return { kind: 'home', cameraId: request.target, label: 'Home camera' };
  }
}

export function answerRequest(
  request: CallSightRequest,
  accepted: boolean,
  facing: SightFacing,
  still: boolean,
): void {
  changeCall(() => ({ request: null }));
  attempt('The answer was not sent', async () => {
    callEngine.answerRequest(request.requestId, accepted);
    if (accepted) {
      startPick(await pickOfRequest(request, facing), still);
    }
  });
}

export async function runEchoTest(): Promise<EchoTestOutcome> {
  changeCall(() => ({ echoTest: { status: 'running' } }));
  try {
    const outcome = await callEngine.echoTest();
    changeCall(() => ({ echoTest: { status: 'done', outcome } }));
    return outcome;
  } catch (error) {
    changeCall(() => ({ echoTest: { status: 'idle' } }));
    throw error;
  }
}

export function clearEchoResult(): void {
  changeCall(() => ({ echoTest: { status: 'idle' } }));
}
