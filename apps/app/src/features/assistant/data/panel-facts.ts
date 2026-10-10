import { ENGINE_LABELS, type AiChatRow, type AssistantMessageRow } from '@smarteverything/domain';
import { useModelLabel } from '../picker/engine-models';

export interface ChatFacts {
  readonly engine: string;
  readonly model: string;
  readonly effort: string | null;
  readonly costMicros: number;
  readonly messages: number;
  readonly files: readonly {
    readonly id: string;
    readonly name: string;
    readonly image: boolean;
  }[];
}

export function usePanelFacts(chat: AiChatRow, rows: readonly AssistantMessageRow[]): ChatFacts {
  const label = useModelLabel(chat.engine);
  return {
    engine: ENGINE_LABELS[chat.engine.kind],
    model: label.name,
    effort: chat.engine.effort,
    costMicros: chat.cost_micros,
    messages: rows.length,
    files: rows.flatMap((row) =>
      row.attachments.map((file) => ({
        id: file.id,
        name: file.name,
        image: file.mime.startsWith('image/'),
      })),
    ),
  };
}
