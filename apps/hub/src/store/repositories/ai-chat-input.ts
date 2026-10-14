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
