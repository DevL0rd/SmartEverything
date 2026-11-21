import { useCallback, useState } from 'react';
import { createGlowDecalFactory } from '../../models/three/glow-decal';
import { createSceneModelSet } from '../../models/three/scene-model';
import type { EditEvent } from './map-3d-edit-protocol';
import { Map3dSession } from './map-3d-session';
import { RenderCore, type RenderCoreOptions } from './render-core';
import { WebglUnavailableError } from './render-core-renderer';
import type { ScreenMarks } from './render-core-marks';
import type { YieldZones } from './edit/overlay-model';

export interface Mounted {
  readonly core: RenderCore;
  readonly session: Map3dSession;
}

function observeSize(host: HTMLElement, core: RenderCore): () => void {
  const observer = new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    core.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio);
  });
  observer.observe(host);
  return () => {
    observer.disconnect();
  };
}

export function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface Map3dMountCallbacks {
  readonly onPick: (roomId: string | null) => void;
  readonly onPickDevice: ((deviceId: string) => void) | undefined;
  readonly onUnavailable: (detail: string) => void;
  readonly onMarks: (marks: ScreenMarks) => void;
  readonly onFrameTime: (frameMs: number) => void;
  readonly onScanFailed: (detail: string) => void;
  readonly onEdit: ((event: EditEvent) => void) | undefined;
  readonly onYield: (zones: YieldZones) => void;
  readonly onPainted: () => void;
}

function coreOrUnavailable(
  onUnavailable: (detail: string) => void,
  options: RenderCoreOptions,
): RenderCore | null {
  try {
    return new RenderCore(options);
  } catch (error) {
    if (!(error instanceof WebglUnavailableError)) throw error;
    onUnavailable(detailOf(error.cause));
    return null;
  }
}

export function useMounted(
  callbacks: Map3dMountCallbacks,
  sharedRenderer: boolean,
): readonly [Mounted | null, (host: HTMLDivElement) => (() => void) | undefined] {
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const { onPick, onPickDevice, onUnavailable, onMarks, onFrameTime, onScanFailed } = callbacks;
  const { onEdit, onYield, onPainted } = callbacks;
  const attach = useCallback(
    (host: HTMLDivElement): (() => void) | undefined => {
      const core = coreOrUnavailable(onUnavailable, {
        host,
        sharedRenderer,
        onPickRoom: onPick,
        onPickDevice,
        onMarks,
        onFrameTime,
        onScanFailed,
        onEdit,
        onYield,
        onPainted,
        createModelSet: createSceneModelSet,
        createDecals: createGlowDecalFactory,
      });
      if (core === null) return undefined;
      const unobserve = observeSize(host, core);
      setMounted({ core, session: new Map3dSession(core) });
      return () => {
        unobserve();
        core.dispose();
        setMounted(null);
      };
    },
    [
      onPick,
      onPickDevice,
      onUnavailable,
      onMarks,
      onFrameTime,
      onScanFailed,
      onEdit,
      onYield,
      onPainted,
      sharedRenderer,
    ],
  );
  return [mounted, attach];
}
