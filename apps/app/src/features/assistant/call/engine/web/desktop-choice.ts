import type { DesktopCaptureKind, DesktopCaptureSource } from '@smarteverything/domain';
import { desktopBridge } from '../../../../../design/platform';
import { SightStartError } from '../sight-failure';

export type DesktopShare = 'desktop_screen' | 'desktop_window';

const KIND_OF: Readonly<Record<DesktopShare, DesktopCaptureKind>> = {
  desktop_screen: 'screen',
  desktop_window: 'window',
};

function matching(
  sources: readonly DesktopCaptureSource[],
  kind: DesktopCaptureKind,
  target: string,
): DesktopCaptureSource | undefined {
  const wanted = target.toLowerCase();
  const ofKind = sources.filter((source) => source.kind === kind);
  return (
    ofKind.find((source) => source.id === target) ??
    ofKind.find((source) => source.title.toLowerCase().includes(wanted))
  );
}

function primaryScreen(sources: readonly DesktopCaptureSource[]): DesktopCaptureSource | undefined {
  const screens = sources.filter((source) => source.kind === 'screen');
  return screens.find((source) => source.primary) ?? screens[0];
}

function pickedSource(
  sources: readonly DesktopCaptureSource[],
  source: DesktopShare,
  target: string | null,
): DesktopCaptureSource {
  const kind = KIND_OF[source];
  if (target === null && source === 'desktop_window') {
    throw new SightStartError(source, 'failed', 'Say which window to share.');
  }
  const found = target === null ? primaryScreen(sources) : matching(sources, kind, target);
  if (found === undefined) {
    throw new SightStartError(source, 'failed', `No open ${kind} matches "${target ?? ''}".`);
  }
  return found;
}

export async function chooseDesktopSource(
  source: DesktopShare,
  target: string | null,
): Promise<void> {
  const bridge = desktopBridge();
  if (bridge === null || (await bridge.captureMode?.()) !== 'picker') {
    return;
  }
  const sources = (await bridge.listCaptureSources?.()) ?? [];
  await bridge.chooseCaptureSource?.(pickedSource(sources, source, target).id);
}
