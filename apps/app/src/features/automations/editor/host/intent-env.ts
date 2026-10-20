import type { EdgeEnd, Scene, Viewport } from '../../model/canvas/contract';
import type { DocumentStore } from '../../model/editor/document-store';
import type { ClipboardPort } from './clipboard-port';

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasMetrics {
  readonly width: number;
  readonly height: number;
}

export interface HostActions {
  readonly openNode: (id: string) => void;
  readonly insertOnEdge: (edgeId: string) => void;
  readonly openSlot: (slotId: string) => void;
  readonly portDropEmpty: (from: EdgeEnd, point: CanvasPoint) => void;
  readonly groupSelection: (ids: readonly string[]) => void;
  readonly viewportSettled: (viewport: Viewport) => void;
  readonly refused: (reason: string) => void;
}

export interface IntentEnv {
  readonly store: DocumentStore;
  readonly scene: () => Scene;
  readonly actions: HostActions;
  readonly clipboard: ClipboardPort;
  readonly ready: (metrics: CanvasMetrics) => void;
}

export class InvalidCanvasIntentError extends Error {
  override readonly name = 'InvalidCanvasIntentError';

  constructor(readonly issues: readonly string[]) {
    super(`The canvas sent an intent outside its contract: ${issues.join('; ')}.`);
  }
}
