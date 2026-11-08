import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { HarnessRuntimeReceipt, HarnessRuntimeRequest } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessRuntime } from '../host/runtime';
import type { ProcessChildren } from './children';
import type { HarnessDispatcherOptions } from './dispatcher-options';
import type { ProcessInteractions } from './interactions';
import type { NativeForward } from './native-forward';
import { submitNativePrompt } from './native-prompt';
import { runtimeReceipt } from './receipts';

type ChildRequest = Exclude<HarnessRuntimeRequest, { kind: 'open' }>;
type ChildPrompt = Extract<ChildRequest, { kind: 'prompt' }>;

interface ChildControlPorts {
  readonly ctx: Context;
  readonly options: HarnessDispatcherOptions;
  readonly runtime: HarnessRuntime;
  readonly children: ProcessChildren;
  readonly interactions: ProcessInteractions;
  readonly forward: NativeForward;
}

async function promptChild(
  request: ChildPrompt,
  agent: Agent,
  ports: ChildControlPorts,
): Promise<void> {
  const child = request.session_id;
  await ports.forward.flush(child);
  await submitNativePrompt(
    ports.runtime,
    {
      prompt: (message) => {
        if (
          ports.options.persistence.boundClaim(child)?.epoch !== request.expected_epoch ||
          ports.children.liveAgent(child) !== agent
        )
          throw new HarnessRuntimeError(
            'ownership_lost',
            'Native helper ownership changed while preparing the prompt.',
            child,
          );
        agent.followup(message);
      },
    },
    request,
    ports,
  );
}

async function applyChildControl(
  request: Exclude<ChildRequest, ChildPrompt>,
  agent: Agent,
  ports: ChildControlPorts,
): Promise<void> {
  if (request.kind === 'interrupt') {
    await ports.runtime.stopObserved(agent, { kind: 'user' });
    return;
  }
  if (request.kind === 'answer') {
    ports.interactions.answer(request.session_id, request.answer);
    return;
  }
  if (request.kind === 'steer' || request.kind === 'note') {
    const message = createUserMessage({
      content: [{ type: 'text', text: request.text }],
      source: { kind: 'user' },
    });
    if (request.kind === 'steer') agent.steer(message);
    else agent.inject(message);
    return;
  }
  throw new HarnessRuntimeError(
    'operation_failed',
    'This operation requires a directly opened native chat.',
    request.session_id,
  );
}

export async function controlChild(
  id: string,
  request: ChildRequest,
  agent: Agent,
  ports: ChildControlPorts,
): Promise<HarnessRuntimeReceipt> {
  const { session_id: child, expected_epoch: epoch } = request;
  const persistence = ports.options.persistence;
  if (request.kind === 'prompt') {
    await promptChild(request, agent, ports);
    return runtimeReceipt(persistence, id, child, { epoch, state: 'accepted' });
  }
  await applyChildControl(request, agent, ports);
  await ports.forward.flush(child);
  const receipt = await runtimeReceipt(persistence, id, child, { epoch, state: 'completed' });
  return request.kind === 'interrupt'
    ? { ...receipt, interactions: ports.interactions.takeCancelled(child) }
    : receipt;
}
