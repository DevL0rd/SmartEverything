import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { MessageSource } from '@deepseek-ai/dsh-llm';
import { HUB_NOTE_SOURCE, hubNoteText } from '../host/hub-note';
import type { Context } from '@deepseek-ai/cordis';
import { Logger } from '@smarteverything/logging';
import { referencesMatchText } from '@smarteverything/domain';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessRuntime } from '../host/runtime';
import type { HarnessSession } from '../host/session';
import { HarnessRuntimeError } from '../host/errors';
import { referencePromptSource, referenceLocatorText } from '../references/prompt';
import { nativePromptContent } from './prompt-content';
import type { HarnessDispatcherOptions } from './dispatcher-options';

const log = new Logger('hub.harness');

type Prompt = Extract<HarnessRuntimeRequest, { kind: 'prompt' }>;

function promptSource(request: Prompt): MessageSource {
  if (request.author === 'hub') return HUB_NOTE_SOURCE;
  const references = request.references ?? [];
  return references.length === 0 ? { kind: 'user' } : referencePromptSource(references);
}

export async function submitNativePrompt(
  runtime: HarnessRuntime,
  session: Pick<HarnessSession, 'prompt'>,
  request: Extract<HarnessRuntimeRequest, { kind: 'prompt' }>,
  ports: { readonly ctx: Context; readonly options: HarnessDispatcherOptions },
): Promise<void> {
  const { ctx, options } = ports;
  const startedAt = performance.now();
  const references = request.references ?? [];
  if (!referencesMatchText(request.text, references))
    throw new HarnessRuntimeError(
      'operation_failed',
      'Native reference tokens differ from their initiating text.',
    );
  await runtime.resolveReferences(
    request.session_id,
    references.map((item) => item.reference),
  );
  const written =
    request.author === 'hub' ? { ...request, text: hubNoteText(request.text) } : request;
  const content = await nativePromptContent(runtime, written, {
    ctx,
    load: options.loadAttachments,
  });
  if (references.length > 0) content.push({ type: 'text', text: referenceLocatorText(references) });
  const message = createUserMessage({ content, source: promptSource(request) });
  session.prompt({ ...message, id: MessageId(request.delivery_id) });
  log.debug('prompt.submitted', () => ({
    session_id: request.session_id,
    delivery_id: request.delivery_id,
    textChars: request.text.length,
    references: references.length,
    contentParts: content.length,
    durationMs: Math.round(performance.now() - startedAt),
  }));
}
