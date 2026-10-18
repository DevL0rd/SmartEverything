import type { AiChatKind, Engine } from '@smarteverything/domain';

export interface NewChat {
  readonly profileId: string;
  readonly kind: AiChatKind;
  readonly title: string;
  readonly icon: string | null;
  readonly parentId: string | null;
  readonly sourceKey: string | null;
  readonly engine: Engine;
  readonly tools?: readonly string[] | null;
  readonly branchMessageId?: string | null;
  readonly titleAuto?: boolean;
}

export function modelKey(engine: Engine): string {
  return JSON.stringify([
    engine.kind,
    engine.model,
    'model_route_id' in engine ? engine.model_route_id : null,
  ]);
}
