import type { Context } from '@deepseek-ai/cordis';
import type { AdmittedPromptContentPart } from '@deepseek-ai/dsh-attachment';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessRuntime } from '../host/runtime';
import { HarnessRuntimeError } from '../host/errors';
import { nativeAttachmentParts, type HarnessAttachment } from './attachments';

type Prompt = Extract<HarnessRuntimeRequest, { kind: 'prompt' }>;
type Load = (sessionId: string, ids: readonly string[]) => AsyncIterable<HarnessAttachment>;

export interface PromptAttachmentPorts {
  readonly ctx: Context;
  readonly load: Load | undefined;
}

export interface PromptModelRoute {
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
}

export async function nativePromptContent(
  runtime: HarnessRuntime,
  request: Prompt,
  ports: PromptAttachmentPorts,
): Promise<AdmittedPromptContentPart[]> {
  const text: AdmittedPromptContentPart = { type: 'text', text: request.text };
  if (request.attachments.length === 0) return [text];
  const options = ports.ctx.agents.get(SessionId(request.session_id))?.options;
  return [text, ...(await nativeAttachmentContent(runtime, request, ports, options))];
}

export async function nativeAttachmentContent(
  runtime: HarnessRuntime,
  request: Prompt,
  ports: PromptAttachmentPorts,
  route: PromptModelRoute | undefined,
): Promise<AdmittedPromptContentPart[]> {
  const { load, ctx } = ports;
  if (load === undefined)
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The selected host has no authenticated attachment transfer.',
    );
  if (route?.provider === undefined || route.model === undefined)
    throw new HarnessRuntimeError(
      'route_unavailable',
      'Attachment admission requires its exact native model route.',
    );
  const model = await ctx.llm.resolveModelInfo(route.provider, route.model);
  const mode = model.inputModalities?.includes('image') === true ? 'current' : 'text';
  const content: AdmittedPromptContentPart[] = [];
  for await (const file of load(request.session_id, request.attachments)) {
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
