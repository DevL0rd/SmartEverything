import { releasePreviewDiagnostics } from './browser-diagnostics';
import type { BrowserSurfaceProps } from '../../../platform/browser-contract';
import { ValueStore } from '../../../design/external-store';
export interface BrowserRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface RetainedBrowserSurface {
  readonly owner: symbol;
  readonly chatId: string;
  readonly props: BrowserSurfaceProps;
  readonly bounds: BrowserRegion;
  readonly attached: boolean;
}
export const browserSurfaces = new ValueStore<readonly RetainedBrowserSurface[]>([]);
const EMPTY_REGION: BrowserRegion = { x: 0, y: 0, width: 0, height: 0 };
export function retainBrowserSurface(
  chatId: string,
  props: BrowserSurfaceProps,
  owner: symbol,
): () => void {
  const existing = browserSurfaces.get().find((entry) => entry.props.target.id === props.target.id);
  const entry = { owner, chatId, props, bounds: existing?.bounds ?? EMPTY_REGION, attached: true };
  browserSurfaces.set([
    ...browserSurfaces.get().filter((row) => row.props.target.id !== props.target.id),
    entry,
  ]);
  return (): void => {
    const rows = browserSurfaces.get();
    browserSurfaces.set(
      rows.map((row) => (row.owner === owner ? { ...row, attached: false } : row)),
    );
  };
}
export function layoutBrowserSurface(id: string, bounds: BrowserRegion, owner: symbol): void {
  browserSurfaces.set(
    browserSurfaces
      .get()
      .map((entry) =>
        entry.props.target.id === id && entry.owner === owner ? { ...entry, bounds } : entry,
      ),
  );
}
export function closeBrowserSurface(id: string): void {
  releasePreviewDiagnostics(id);
  browserSurfaces.set(browserSurfaces.get().filter((entry) => entry.props.target.id !== id));
}
export function closeBrowserSurfaces(): void {
  for (const surface of browserSurfaces.get()) releasePreviewDiagnostics(surface.props.target.id);
  browserSurfaces.set([]);
}
