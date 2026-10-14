import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { SessionId } from '@deepseek-ai/dsh-session';
import { JSON_VALUE } from '@smarteverything/domain';
import type {
  AssistantMessageRow,
  HarnessRuntimeRequest,
  JsonValue,
} from '@smarteverything/domain';
import type { HarnessControlPersistence } from './contracts';
import type { HarnessRuntime } from '../host/runtime';
import { HarnessRuntimeError } from '../host/errors';
import { nativeAttachmentParts, type HarnessAttachment } from './attachments';
import { LegacyHistoryEvents } from './legacy-history-events';
import { readNativeHistory } from './history';

type Open = Extract<HarnessRuntimeRequest, { kind: 'open' }>;
type Load = (sessionId: string, ids: readonly string[]) => AsyncIterable<HarnessAttachment>;
export async function importLegacyHistory(
  runtime: HarnessRuntime,
  input: Open,
  ports: { readonly persistence: HarnessControlPersistence; readonly load: Load | undefined },
): Promise<void> {
  if (input.history_import === undefined) return;
  const { persistence, load } = ports;
  const metadata = await persistence.metadata(input.claim.session_id);
  const events = new LegacyHistoryEvents(metadata.header);
  for (const row of input.history_import) {
    if (row.chat_id !== input.chat_id || row.profile_id !== metadata.profile_id)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Historical import belongs to another conversation or profile.',
      );
    events.append(row, await legacyAttachments(runtime, input.claim.session_id, row, load));
  }
  const imported = events.history();
  const stored = readNativeHistory(
    metadata.header,
    await persistence.read(SessionId(input.claim.session_id)),
  );
  if (stored.length !== 0) {
    if (!isDeepStrictEqual(stored.slice(0, imported.length), imported))
      throw new HarnessRuntimeError(
        'operation_failed',
        'Historical import differs from the committed native prefix; existing history was retained.',
      );
    return;
  }
  await persistence.verify(input.claim);
  await persistence.append(input.claim, randomUUID(), imported);
  await persistence.flush(input.claim, imported.length);
}

async function legacyAttachments(
  runtime: HarnessRuntime,
  id: string,
  row: AssistantMessageRow,
  load: Load | undefined,
): Promise<readonly JsonValue[]> {
  if (row.attachments.length === 0) return [];
  if (load === undefined)
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'Historical media needs its authenticated attachment transfer.',
    );
  const content: JsonValue[] = [];
  for (const file of row.attachments) {
    let count = 0;
    for await (const transferred of load(id, [file.id])) {
      count += 1;
      const admitted = await runtime.admitPromptContent(
        await nativeAttachmentParts(runtime, transferred, 'history'),
      );
      content.push(
        ...admitted.map((part) => JSON_VALUE.parse({ ...part, original_attachment_id: file.id })),
      );
    }
    if (count !== 1)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Historical attachment transfer did not return exactly its original file.',
      );
  }
  return content;
}
