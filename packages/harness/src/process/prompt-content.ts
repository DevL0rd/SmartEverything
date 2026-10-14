import type { Context } from '@deepseek-ai/cordis';
import type { AdmittedPromptContentPart } from '@deepseek-ai/dsh-attachment';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessRuntime } from '../host/runtime';
import { HarnessRuntimeError } from '../host/errors';
import { nativeAttachmentParts, type HarnessAttachment } from './attachments';

type Prompt = Extract<HarnessRuntimeRequest, { kind: 'prompt' }>;
type Load = (sessionId: string, ids: readonly string[]) => AsyncIterable<HarnessAttachment>;

export async function nativePromptContent(
  runtime: HarnessRuntime,
  request: Prompt,
  ports: { readonly ctx: Context; readonly load: Load | undefined },
): Promise<AdmittedPromptContentPart[]> {
  const content: AdmittedPromptContentPart[] = [{ type: 'text', text: request.text }];
  if (request.attachments.length === 0) return content;
  if (ports.load === undefined)
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The selected host has no authenticated attachment transfer.',
    );
  const agent = ports.ctx.agents.get(SessionId(request.session_id));
  if (agent?.options.provider === undefined || agent.options.model === undefined)
    throw new HarnessRuntimeError(
      'route_unavailable',
      'Attachment admission requires its exact native model route.',
    );
  const model = await ports.ctx.llm.resolveModelInfo(agent.options.provider, agent.options.model);
  const mode = model.inputModalities?.includes('image') === true ? 'current' : 'text';
  for await (const file of ports.load(request.session_id, request.attachments)) {
    const parts = await runtime.admitPromptContent(
      await nativeAttachmentParts(runtime, file, mode),
    );
    content.push(
      ...parts.map((part) => ({
        ...part,
        ...(file.id === undefined ? {} : { original_attachment_id: file.id }),
      })),
    );
  }
  return content;
}
