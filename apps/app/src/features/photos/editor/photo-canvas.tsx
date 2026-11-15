'use dom';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import type { PhotoCanvasProps } from './canvas-protocol';
import {
  createScene,
  drawScene,
  releaseScene,
  uploadPatched,
  uploadPhoto,
  type GlScene,
} from './gl-render';

const FRAME = { width: '100%', height: '100%', overflow: 'hidden' } as const;

const CANVAS = { width: '100%', height: '100%', display: 'block' } as const;

type Report = PhotoCanvasProps['onStatus'];

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Surface {
  readonly canvas: HTMLCanvasElement;
  readonly scene: GlScene;
}

function fitToClient(element: HTMLCanvasElement): void {
  const canvas = element;
  const ratio = window.devicePixelRatio;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
}

function useSurface(
  report: Report,
): readonly [Surface | null, number, (canvas: HTMLCanvasElement) => () => void] {
  const [surface, setSurface] = useState<Surface | null>(null);
  const [generation, setGeneration] = useState(0);
  const attach = useCallback(
    (canvas: HTMLCanvasElement): (() => void) => {
      const lost = (event: Event): void => {
        event.preventDefault();
        setSurface(null);
        background(
          report('lost', 'the WebGL context was lost'),
          'photos.editor.canvas_report_failed',
        );
      };
      canvas.addEventListener('webglcontextlost', lost);
      const observer = new ResizeObserver(() => {
        fitToClient(canvas);
        setGeneration((value) => value + 1);
      });
      observer.observe(canvas);
      let scene: GlScene | null = null;
      try {
        scene = createScene(canvas);
        setSurface({ canvas, scene });
      } catch (error) {
        background(report('no-webgl', detailOf(error)), 'photos.editor.canvas_report_failed');
      }
      return (): void => {
        observer.disconnect();
        canvas.removeEventListener('webglcontextlost', lost);
        if (scene !== null) releaseScene(scene);
        setSurface(null);
      };
    },
    [report],
  );
  return [surface, generation, attach];
}

interface LoadedPhoto {
  readonly scene: GlScene;
  readonly uri: string;
  readonly image: HTMLImageElement;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = (): void => {
      resolve(image);
    };
    image.onerror = (): void => {
      reject(new Error('the image did not load'));
    };
    image.src = uri;
  });
}

function usePhoto(
  scene: GlScene | null,
  uri: string,
  report: Report,
  sized: PhotoCanvasProps['onLoaded'],
): LoadedPhoto | null {
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null);
  useEffect(() => {
    if (scene === null) return undefined;
    let current = true;
    loadImage(uri).then(
      (image) => {
        if (!current) return;
        uploadPhoto(scene, image);
        setLoaded({ scene, uri, image });
        background(
          sized(image.naturalWidth, image.naturalHeight),
          'photos.editor.canvas_report_failed',
        );
      },
      () => {
        if (current)
          background(
            report('failed', 'the photo did not load'),
            'photos.editor.canvas_report_failed',
          );
      },
    );
    return (): void => {
      current = false;
    };
  }, [scene, uri, report, sized]);
  return loaded !== null && loaded.scene === scene && loaded.uri === uri ? loaded : null;
}

function patchesKey(patches: PhotoCanvasProps['patches']): string {
  return JSON.stringify(patches.map((patch) => [patch.box, patch.uri]));
}

function usePatches(
  photo: LoadedPhoto | null,
  patches: PhotoCanvasProps['patches'],
  report: Report,
): string | null {
  const key = patchesKey(patches);
  const [placed, setPlaced] = useState<{
    readonly photo: LoadedPhoto;
    readonly key: string;
  } | null>(null);
  const latest = useStableCallback(() => patches);
  useEffect(() => {
    if (photo === null) return undefined;
    let current = true;
    Promise.all(
      latest().map(async (patch) => ({ box: patch.box, image: await loadImage(patch.uri) })),
    ).then(
      (layers) => {
        if (!current) return;
        uploadPatched(photo.scene, photo.image, layers);
        setPlaced({ photo, key });
      },
      (error: unknown) => {
        if (current)
          background(report('failed', detailOf(error)), 'photos.editor.canvas_report_failed');
      },
    );
    return (): void => {
      current = false;
    };
  }, [photo, key, latest, report]);
  return placed !== null && placed.photo === photo && placed.key === key ? key : null;
}

export default function PhotoCanvas(props: PhotoCanvasProps): ReactNode {
  const report = useStableCallback(props.onStatus);
  const loadedSize = useStableCallback(props.onLoaded);
  const [surface, size, attach] = useSurface(report);
  const scene = surface?.scene ?? null;
  const photo = usePhoto(scene, props.uri, report, loadedSize);
  const placed = usePatches(photo, props.patches, report);
  useEffect(() => {
    if (surface === null || placed === null || size === 0) return;
    const ratio = window.devicePixelRatio;
    drawScene(surface.scene, props.views, {
      width: surface.canvas.width,
      height: surface.canvas.height,
      columns: props.grid.columns,
      gap: Math.round(props.grid.gap * ratio),
      rowGap: Math.round(props.grid.rowGap * ratio),
    });
  }, [surface, placed, size, props.views, props.grid]);
  return (
    <div style={FRAME} role="img" aria-label={props.label}>
      <canvas ref={attach} style={CANVAS} />
    </div>
  );
}
