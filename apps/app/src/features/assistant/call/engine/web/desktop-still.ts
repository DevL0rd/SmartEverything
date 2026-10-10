import type {
  DesktopCaptureKind,
  DesktopCaptureSource,
  SmartEverythingDesktop,
} from '@smarteverything/domain';
import { desktopBridge } from '../../../../../design/platform';
import { SightStartError } from '../sight-failure';

export interface DesktopGlimpse {
  readonly source: 'desktop_screen' | 'desktop_window';
  readonly label: string;
  readonly jpeg: Uint8Array;
}

const KIND_OF: Readonly<Record<DesktopGlimpse['source'], DesktopCaptureKind>> = {
  desktop_screen: 'screen',
  desktop_window: 'window',
};

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

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

async function captureIdOf(
  bridge: SmartEverythingDesktop,
  source: DesktopGlimpse['source'],
  target: string | null,
): Promise<string | null> {
  if ((await bridge.captureMode?.()) !== 'picker') {
    return null;
  }
  if (target === null) {
    if (source === 'desktop_window') {
      throw new SightStartError(source, 'failed', 'Say which window to look at.');
    }
    return null;
  }
  const kind = KIND_OF[source];
  const found = matching((await bridge.listCaptureSources?.()) ?? [], kind, target);
  if (found === undefined) {
    throw new SightStartError(source, 'failed', `No open ${kind} matches "${target}".`);
  }
  return found.id;
}

export async function desktopStill(
  source: DesktopGlimpse['source'],
  target: string | null,
): Promise<DesktopGlimpse | null> {
  const bridge = desktopBridge();
  if (bridge?.captureStill === undefined) {
    return null;
  }
  const still = await bridge.captureStill(await captureIdOf(bridge, source, target));
  return { source, label: still.title, jpeg: bytesOf(still.dataBase64) };
}
