import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent';
import { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal';
import type { DshWriterClaim, HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessControlPersistence } from './contracts';
import type { NativeForward } from './native-forward';
import { HarnessRuntimeError } from '../host/errors';
import { helperInputSource, nativeInputId } from '../host/helper-input';
import type { HarnessRuntime } from '../host/runtime';
import {
  nativeAttachmentContent,
  type PromptAttachmentPorts,
  type PromptModelRoute,
} from './prompt-content';

type Prompt = Extract<HarnessRuntimeRequest, { kind: 'prompt' }>;
type HelperParent = NonNullable<Prompt['helper_parent']>;

interface HelperPromptPorts extends PromptAttachmentPorts {
  readonly runtime: HarnessRuntime;
  readonly persistence: HarnessControlPersistence;
  readonly forward: NativeForward;
}

const INPUTS = z.object({ inserted: z.array(z.unknown()) });

function alreadyReceived(history: unknown, deliveryId: string): boolean {
  const records = z.array(z.object({ type: z.string(), data: z.unknown() })).parse(history);
  return records.some((record) => {
    if (record.type === 'user/message') return nativeInputId(record.data) === deliveryId;
    if (record.type !== 'agent/inbox/spliced') return false;
    const splice = INPUTS.parse(record.data);
    return splice.inserted.some((message) => nativeInputId(message) === deliveryId);
  });
}

function humanPromptParent(request: Prompt): HelperParent {
  const parent = request.helper_parent;
  if (parent === undefined || request.author !== 'person' || (request.references?.length ?? 0) > 0)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Helper dialogue requires a prompt from the person without structured references.',
      request.session_id,
    );
  return parent;
}

interface HelperOwnership {
  readonly parentAgent: Agent;
  readonly parentClaim: DshWriterClaim;
  readonly childClaim: DshWriterClaim;
}

function helperOwnership(
  request: Prompt,
  parent: HelperParent,
  ports: HelperPromptPorts,
): HelperOwnership {
  const { ctx, persistence } = ports;
  const child = request.session_id;
  const parentAgent = ctx.agents.get(SessionId(parent.session_id));
  const childClaim = persistence.boundClaim(child);
  const parentClaim = persistence.boundClaim(parent.session_id);
  if (
    parentAgent === undefined ||
    childClaim?.epoch !== request.expected_epoch ||
    parentClaim?.epoch !== parent.epoch
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The helper or its parent changed execution host.',
      child,
    );
  return { parentAgent, parentClaim, childClaim };
}

async function helperPromptContent(
  request: Prompt,
  parent: HelperParent,
  ports: HelperPromptPorts,
): Promise<ContentBlock[]> {
  const text =
    parent.quote === null
      ? request.text
      : `Replying to your message:
${parent.quote}

${request.text}`;
  if (request.attachments.length === 0) return [{ type: 'text', text }];
  const child = SessionId(request.session_id);
  const options = await helperAttachmentRoute(ports, child, parent.session_id);
  const content: ContentBlock[] = await nativeAttachmentContent(
    ports.runtime,
    request,
    ports,
    options,
  );
  if (text.trim() !== '') content.unshift({ type: 'text', text });
  if (content.length === 0)
    throw new HarnessRuntimeError(
      'operation_failed',
      'The helper prompt has no usable input.',
      child,
    );
  return content;
}

function assertAttachmentLineage(header: SessionHeader, parent: string, child: string): void {
  if (header.origin !== 'subagent' || header.parentSession !== parent)
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The attachment input names a helper outside its original conversation.',
      child,
    );
}

async function helperAttachmentRoute(
  { ctx }: HelperPromptPorts,
  child: SessionId,
  parent: string,
): Promise<PromptModelRoute> {
  const agent = ctx.agents.get(child);
  if (agent !== undefined) {
    assertAttachmentLineage(agent.session.header, parent, child);
    return agent.options;
  }
  const query = ctx.get('sessionQuery');
  if (query === undefined)
    throw new HarnessRuntimeError(
      'route_unavailable',
      'The native helper model route cannot be read on this host.',
      child,
    );
  using observation = await query.observeSession(child);
  assertAttachmentLineage(observation.header, parent, child);
  const ownEvents = observation.events.slice(observation.inheritedEventCount);
  const descriptor = foldSubagentDescriptor(ownEvents);
  if (descriptor?.mode !== 'continuable')
    throw new HarnessRuntimeError(
      'route_unavailable',
      'The helper has no supported native continuation model route.',
      child,
    );
  return { provider: descriptor.agentProvider, model: descriptor.agentModel };
}

function assertUnchangedOwnership(current: HelperOwnership, ownership: HelperOwnership): void {
  if (
    current.parentAgent !== ownership.parentAgent ||
    !isDeepStrictEqual(current.parentClaim, ownership.parentClaim) ||
    !isDeepStrictEqual(current.childClaim, ownership.childClaim)
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The helper or its parent changed while preparing its input.',
      ownership.childClaim.session_id,
    );
}

export class HelperPromptDeliveries {
  private readonly pending = new Map<
    string,
    { readonly request: Prompt; readonly result: Promise<void> }
  >();

  deliver(request: Prompt, ports: HelperPromptPorts): Promise<void> {
    const id = request.delivery_id;
    const previous = this.pending.get(id);
    if (previous !== undefined) {
      if (!isDeepStrictEqual(previous.request, request))
        throw new HarnessRuntimeError(
          'operation_failed',
          'Helper delivery identity was reused with different input.',
          request.session_id,
        );
      return previous.result;
    }
    const result = queueHelperPrompt(request, ports).finally(() => {
      this.pending.delete(id);
    });
    this.pending.set(id, { request, result });
    return result;
  }
}

async function queueHelperPrompt(request: Prompt, ports: HelperPromptPorts): Promise<void> {
  const { ctx, persistence, forward } = ports;
  const { session_id: child, delivery_id: id } = request;
  const parent = humanPromptParent(request);
  const received = async (): Promise<boolean> =>
    alreadyReceived(await persistence.read(SessionId(child), { offset: parent.start_seq }), id);
  await forward.flush(child);
  if (await received()) return;
  const ownership = helperOwnership(request, parent, ports);
  const subagents = ctx.get('subagents');
  if (subagents === undefined)
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'This host cannot continue a native helper.',
      child,
    );
  const content = await helperPromptContent(request, parent, ports);
  const current = helperOwnership(request, parent, ports);
  assertUnchangedOwnership(current, ownership);
  await queueHostSubagentPrompt(
    subagents,
    ownership.parentAgent,
    SessionId(child),
    content,
    helperInputSource(id),
    new AbortController().signal,
  );
  await forward.flush(child);
  if (!(await received()))
    throw new HarnessRuntimeError(
      'source_outcome_unknown',
      'Native helper input was not confirmed in its durable inbox.',
      child,
    );
}
