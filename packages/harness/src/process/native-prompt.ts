import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';
import { referencesMatchText } from '@smarteverything/domain';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessRuntime } from '../host/runtime';
import type { HarnessSession } from '../host/session';
import { HarnessRuntimeError } from '../host/errors';
import { referencePromptSource, referenceLocatorText } from '../references/prompt';
import { nativePromptContent } from './prompt-content';
import type { HarnessDispatcherOptions } from './dispatcher-options';

export async function submitNativePrompt(
  runtime: HarnessRuntime,
  session: HarnessSession,
  request: Extract<HarnessRuntimeRequest, { kind: 'prompt' }>,
  ports: { readonly ctx: Context; readonly options: HarnessDispatcherOptions },
): Promise<void> {
  const { ctx, options } = ports;
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
  if (references.length > 0) {
    if (options.validateReferences === undefined)
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'Central reference validation is unavailable.',
      );
    await options.validateReferences(request.session_id, request.delivery_id, references);
  }
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
}
