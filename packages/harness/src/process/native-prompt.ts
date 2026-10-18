import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
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

export async function submitNativePrompt(
  runtime: HarnessRuntime,
  session: HarnessSession,
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
  const content = await nativePromptContent(runtime, request, {
    ctx,
    load: options.loadAttachments,
  });
  if (references.length > 0) content.push({ type: 'text', text: referenceLocatorText(references) });
  const message = createUserMessage({
    content,
    source: references.length === 0 ? { kind: 'user' } : referencePromptSource(references),
  });
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
