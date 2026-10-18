import type { Context } from '@deepseek-ai/cordis';
import { ApiError } from '@smarteverything/domain';
import { facts } from '../assistant/prompt-facts';
import { stablePrompt, turnPrompt, type PromptFacts } from '../assistant/conversation/prompt';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { HarnessService } from './service';

const CONVERSATION = 'smarteverything-conversation';

export interface HarnessPromptPorts {
  readonly tools: (id: string) => ToolHub;
  readonly now: () => Date;
  readonly role: (id: string) => 'owner' | 'member';
}

export interface HarnessPrompt {
  readonly system: string;
  readonly turn: string;
}

export function installHubPrompt(
  ctx: Context,
  service: HarnessService,
  ports: HarnessPromptPorts,
): void {
  const built = new WeakMap<object, HarnessPrompt>();
  const current = (assembly: object, agent: { readonly id: string }): HarnessPrompt => {
    const cached = built.get(assembly);
    if (cached !== undefined) return cached;
    const prompt = harnessPrompt(service, agent.id, {
      tools: ports.tools(agent.id),
      now: ports.now(),
      role: ports.role(agent.id),
    });
    built.set(assembly, prompt);
    return prompt;
  };
  ctx.systemPrompt.section({
    name: CONVERSATION,
    order: 0,
    interpolate: false,
    text: (context): string =>
      context.agent === undefined ? '' : current(context, context.agent).system,
  });
  ctx.systemPrompt.context({
    name: CONVERSATION,
    order: 0,
    required: true,
    interpolate: false,
    text: (context): string =>
      context.agent === undefined ? '' : current(context, context.agent).turn,
  });
}

export function harnessPrompt(
  service: HarnessService,
  id: string,
  context: { readonly tools: ToolHub; readonly now: Date; readonly role: 'owner' | 'member' },
): HarnessPrompt {
  const grant = service.storage.grant(id);
  const metadata = service.store.dshSessions.stat(id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('conflict', 'The initiating native conversation is unavailable.');
  const chat = service.store.aiChats.chat(metadata.chat_id);
  const scoped = context.tools;
  const host = service.directory.get(grant.target).host;
  const promptFacts: PromptFacts = {
    ...facts(service.store, chat, scoped, { now: context.now, clientId: grant.client_id }),
    executionHost:
      grant.target.kind === 'server'
        ? "the home's own server"
        : `the selected ${host.platform} device ${JSON.stringify(host.name)}`,
    role: context.role,
    toolIndex: '',
    catalogue: '',
  };
  return { system: stablePrompt(promptFacts), turn: turnPrompt(promptFacts) };
}
