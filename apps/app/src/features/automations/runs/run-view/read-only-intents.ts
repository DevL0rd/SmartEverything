import type { CanvasIntent } from '../../model/canvas/contract';
import { selectIds } from '../../editor/host/edit-intents';
import type { CanvasMetrics } from '../../editor/host/intent-env';
import type { DocumentStore } from '../../model/editor/document-store';

export interface ReadOnlyEnv {
  readonly store: DocumentStore;
  readonly ready: (metrics: CanvasMetrics) => void;
  readonly settled: () => void;
}

export function applyReadOnly(intent: CanvasIntent, env: ReadOnlyEnv): void {
  if (intent.type === 'select') selectIds(env.store, intent.ids);
  else if (intent.type === 'openNode') selectIds(env.store, [intent.id]);
  else if (intent.type === 'viewportSettled') env.settled();
  else if (intent.type === 'ready') env.ready(intent.metrics);
}
