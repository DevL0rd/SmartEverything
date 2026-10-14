import { useState } from 'react';
import { copyText } from '../../../components/copy-button';
import { notify } from '../../../components/toast-store';
import type { BrowserHandle } from '../../../platform/browser-contract';
import { requirePreviewDocument } from './browser-diagnostics-scope';
import {
  PreviewToolUnavailableError,
  waitForBrowserMenuClose,
  waitForPreviewLayout,
} from './browser-tool-readiness';
import {
  PREVIEW_CAPTURE,
  type PreviewDiagnostics,
  type PreviewDiagnosticsSnapshot,
  type PreviewSupport,
} from './browser-diagnostics-contract';
export type PreviewTool = 'capture' | 'clear-cache' | 'clear-cookies' | 'clear-storage';
const COMPLETION: Readonly<Record<PreviewTool, string>> = {
  capture: 'Preview captured',
  'clear-cache': 'Preview cache cleared',
  'clear-cookies': 'Preview cookies cleared',
  'clear-storage': 'Website data cleared',
};
export function toolSupport(
  snapshot: PreviewDiagnosticsSnapshot,
  tool: PreviewTool,
): PreviewSupport {
  switch (tool) {
    case 'capture':
      return snapshot.captureCapability ?? snapshot.capture;
    case 'clear-cache':
      return snapshot.clearCache;
    case 'clear-cookies':
      return snapshot.clearCookies;
    case 'clear-storage':
      return snapshot.clearStorage;
  }
}
async function perform(
  controller: PreviewDiagnostics,
  tool: PreviewTool,
  menuOwner: symbol | null,
): Promise<void> {
  const current = controller.read().console;
  if (current.kind === 'unavailable') throw new PreviewToolUnavailableError(current.reason);
  const expected = Object.freeze({ documentId: current.documentId, epoch: current.epoch });
  await waitForBrowserMenuClose(menuOwner);
  await waitForPreviewLayout(controller, expected);
  const ready = controller.read().console;
  if (ready.kind === 'unavailable') throw new PreviewToolUnavailableError(ready.reason);
  requirePreviewDocument(ready, expected);
  switch (tool) {
    case 'clear-cache':
      await controller.clearCache(expected);
      return;
    case 'clear-storage':
      await controller.clearStorage(expected);
      return;
    case 'clear-cookies':
      await controller.clearCookies(expected);
      return;
    case 'capture':
      requirePreviewDocument(PREVIEW_CAPTURE.parse(await controller.capture(expected)), expected);
      return;
  }
}
interface BrowserToolsContext {
  readonly controller: PreviewDiagnostics;
  readonly snapshot: PreviewDiagnosticsSnapshot;
  readonly controls: BrowserHandle;
  readonly address: string | null;
  readonly ready: boolean;
}
interface BrowserToolControls {
  readonly pending: PreviewTool | null;
  readonly handlers: Readonly<Record<'reload' | 'copy' | PreviewTool, () => void>>;
  readonly run: (tool: PreviewTool, menuOwner?: symbol | null) => void;
}
export function useBrowserTools({
  controller,
  snapshot,
  controls,
  address,
  ready,
}: BrowserToolsContext): BrowserToolControls {
  const [pending, setPending] = useState<PreviewTool | null>(null);
  const run = (tool: PreviewTool, menuOwner: symbol | null = null): void => {
    if (pending !== null) return;
    const support = toolSupport(snapshot, tool);
    if (!ready || support.kind === 'unavailable') {
      notify({
        message: support.kind === 'unavailable' ? support.reason : 'Choose a preview first',
        tone: 'default',
      });
      return;
    }
    setPending(tool);
    void perform(controller, tool, menuOwner)
      .then(
        () => {
          notify({ message: COMPLETION[tool] });
        },
        (error: unknown) => {
          notify({ message: 'Browser action could not finish', error, tone: 'critical' });
        },
      )
      .finally(() => {
        setPending(null);
      });
  };
  return {
    pending,
    run,
    handlers: {
      ...navigationHandlers(controls, address, ready),
      ...websiteToolHandlers(run),
    },
  };
}

function navigationHandlers(
  controls: BrowserHandle,
  address: string | null,
  ready: boolean,
): Pick<BrowserToolControls['handlers'], 'reload' | 'copy'> {
  return {
    reload: (): void => {
      if (ready) controls.reload();
      else notify({ message: 'Choose a preview to reload', tone: 'default' });
    },
    copy: (): void => {
      if (address !== null) copyText(address, 'Address');
      else notify({ message: 'This preview has no copyable website address', tone: 'default' });
    },
  };
}

function websiteToolHandlers(
  run: (tool: PreviewTool) => void,
): Readonly<Record<PreviewTool, () => void>> {
  return {
    capture: (): void => {
      run('capture');
    },
    'clear-cache': (): void => {
      run('clear-cache');
    },
    'clear-cookies': (): void => {
      run('clear-cookies');
    },
    'clear-storage': (): void => {
      run('clear-storage');
    },
  };
}
