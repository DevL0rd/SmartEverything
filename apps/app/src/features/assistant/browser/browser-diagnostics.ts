import { useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import type { BrowserTarget } from '@smarteverything/domain';
import { ValueStore, useValue, usePausable } from '../../../design/external-store';
import { appPlatform } from '../../../design/platform';
import { useSession } from '../../../store/selectors';
import { previewDiagnosticsAdapter } from './browser-diagnostics-adapter';
import type {
  PreviewDiagnostics,
  PreviewDiagnosticsAdapter,
  PreviewDiagnosticsSnapshot,
} from './browser-diagnostics-contract';

const adapter = new ValueStore<PreviewDiagnosticsAdapter | null>(null);
class PreviewDiagnosticsUnavailableError extends Error {
  override readonly name = 'PreviewDiagnosticsUnavailableError';
}
export function registerPreviewDiagnostics(next: PreviewDiagnosticsAdapter): () => void {
  adapter.set(next);
  return (): void => {
    if (adapter.get() === next) adapter.set(null);
  };
}
function unavailable(reason: string): PreviewDiagnostics {
  const support = { kind: 'unavailable', reason } as const;
  const snapshot: PreviewDiagnosticsSnapshot = {
    console: support,
    capture: support,
    captureCapability: support,
    clearCache: support,
    clearCookies: support,
    clearStorage: support,
  };
  const fail = (): Promise<never> => Promise.reject(new PreviewDiagnosticsUnavailableError(reason));
  return {
    read: (): PreviewDiagnosticsSnapshot => snapshot,
    subscribe: (): (() => void) => () => undefined,
    loadOlder: fail,
    capture: fail,
    clearCache: fail,
    clearCookies: fail,
    clearStorage: fail,
    setVisible: (): void => undefined,
    dispose: (): void => undefined,
  };
}
const retained = new Map<
  string,
  {
    readonly key: string;
    readonly factory: PreviewDiagnosticsAdapter | null;
    readonly controller: PreviewDiagnostics;
  }
>();
export function releasePreviewDiagnostics(id: string): void {
  retained.get(id)?.controller.dispose();
  retained.delete(id);
}
function retainDiagnostics(
  owner: { readonly chatId: string; readonly profileId: string; readonly clientId: string },
  target: BrowserTarget,
  factory: PreviewDiagnosticsAdapter | null,
): PreviewDiagnostics {
  const { chatId, profileId, clientId } = owner;
  const key = JSON.stringify({ chatId, profileId, clientId, target });
  const previous = retained.get(target.id);
  if (previous?.key === key && previous.factory === factory) return previous.controller;
  releasePreviewDiagnostics(target.id);
  const scope = { clientId, profileId, chatId, viewerId: Crypto.randomUUID(), target };
  const controller =
    factory?.(scope) ??
    previewDiagnosticsAdapter(scope) ??
    unavailable(
      appPlatform() === 'web'
        ? 'This web preview cannot read page console output, capture pixels or clear website data.'
        : 'This app version does not support preview console output, capture or website data tools.',
    );
  retained.set(target.id, { key, factory, controller });
  return controller;
}
export function usePreviewDiagnostics(
  chatId: string,
  profileId: string,
  target: BrowserTarget | null,
  _visible: boolean,
): { readonly controller: PreviewDiagnostics; readonly snapshot: PreviewDiagnosticsSnapshot } {
  const factory = useValue(adapter);
  const clientId = useSession().client.id;
  const controller = useMemo(
    () =>
      target === null
        ? unavailable('Choose a preview to use its console and tools.')
        : retainDiagnostics({ chatId, profileId, clientId }, target, factory),
    [factory, clientId, profileId, chatId, target],
  );
  return { controller, snapshot: usePausable(controller.subscribe, controller.read) };
}
