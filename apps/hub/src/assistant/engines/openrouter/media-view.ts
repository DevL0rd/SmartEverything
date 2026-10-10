import { readFile } from 'node:fs/promises';
import type { AssistantAttachment, AssistantMessageRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ContentPart } from '../../../openrouter/chat-types';
import type { StoredAttachment } from '../../../store/repositories/assistant-chat';
import type { Store } from '../../../store/store';
import { mediaKindOf, type MediaNotes } from '../../../transcripts/media-notes';
import { attachmentNote } from '../../attachment-note';
import type { AssistantFiles } from '../../files';

const INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

export interface MediaView {
  readonly part: (file: AssistantAttachment, messageId: string) => Promise<ContentPart | null>;
  readonly note: (file: AssistantAttachment) => string;
}

export interface MediaPlanInput {
  readonly rows: readonly AssistantMessageRow[];
  readonly newest: ReadonlySet<string>;
  readonly images: boolean;
  readonly store: Store;
  readonly files: AssistantFiles;
  readonly notes: MediaNotes;
  readonly log: Logger;
}

export interface MediaPlan {
  readonly view: MediaView;
  readonly afterTurn: () => void;
}

interface Planned {
  readonly stored: StoredAttachment;
  readonly native: boolean;
}

function plannedOf(
  input: MediaPlanInput,
  row: AssistantMessageRow,
  file: AssistantAttachment,
): Planned {
  const stored = input.store.assistantChat.attachment(file.id);
  const readable =
    input.images && mediaKindOf(file.mime) === 'image' && file.bytes <= INLINE_IMAGE_BYTES;
  const native = readable && (input.newest.has(row.id) || stored.transcript === null);
  return { stored, native };
}

async function textOf(input: MediaPlanInput, planned: Planned): Promise<string | null> {
  try {
    return await input.notes.ensure(planned.stored);
  } catch (cause) {
    input.log.error('assistant.media_note_failed', cause, { attachmentId: planned.stored.id });
    return null;
  }
}

async function nativePart(
  input: MediaPlanInput,
  file: AssistantAttachment,
  stored: StoredAttachment,
): Promise<ContentPart> {
  const data = await readFile(input.files.pathOf(stored));
  return {
    type: 'image_url',
    image_url: { url: `data:${file.mime};base64,${data.toString('base64')}` },
  };
}

export async function planMedia(input: MediaPlanInput): Promise<MediaPlan> {
  const planned = new Map<string, Planned>();
  input.rows.forEach((row) => {
    row.attachments.forEach((file) => {
      planned.set(`${row.id}:${file.id}`, plannedOf(input, row, file));
    });
  });
  const texts = new Map<string, string>();
  const pending = [...planned.values()].filter(
    ({ native, stored }) =>
      !native && stored.transcript === null && mediaKindOf(stored.mime) !== null,
  );
  await Promise.all(
    pending.map(async (item) => {
      const text = await textOf(input, item);
      if (text !== null) {
        texts.set(item.stored.id, text);
      }
    }),
  );
  const view: MediaView = {
    part: async (file, messageId) => {
      const item = planned.get(`${messageId}:${file.id}`);
      return item?.native === true ? nativePart(input, file, item.stored) : null;
    },
    note: (file) => {
      const stored = [...planned.values()].find((item) => item.stored.id === file.id)?.stored;
      return attachmentNote(file, texts.get(file.id) ?? stored?.transcript ?? null);
    },
  };
  return {
    view,
    afterTurn: (): void => {
      [...planned.values()]
        .filter(({ native, stored }) => native && stored.transcript === null)
        .forEach(({ stored }) => {
          input.notes.later(stored);
        });
    },
  };
}
