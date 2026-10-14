import { projectWorkspaceContext } from '@smarteverything/harness/process';
import type { Context } from '@deepseek-ai/cordis';
import { ApiError } from '@smarteverything/domain';
import { facts } from '../assistant/prompt-facts';
import { toolGuide } from '../ai-tools/tool-guide';
import { discoveryAvailable } from '../ai-tools/tool-sets';
import { stablePrompt, turnPrompt } from '../assistant/conversation/prompt';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { HarnessService } from './service';

export function installHubPrompt(
  ctx: Context,
  service: HarnessService,
  ports: {
    readonly tools: (id: string) => ToolHub;
    readonly now: () => Date;
    readonly role: (id: string) => 'owner' | 'member';
  },
): void {
  ctx.systemPrompt.context({
    name: 'smarteverything-conversation',
    order: 0,
    required: true,
    interpolate: false,
    text: (context): string => {
      if (context.agent === undefined) return '';
      return harnessPrompt(service, context.agent.id, {
        tools: ports.tools(context.agent.id),
        now: ports.now(),
        role: ports.role(context.agent.id),
      });
    },
  });
}

export function harnessPrompt(
  service: HarnessService,
  id: string,
  context: { readonly tools: ToolHub; readonly now: Date; readonly role: 'owner' | 'member' },
): string {
  const grant = service.storage.grant(id);
  const metadata = service.store.dshSessions.stat(id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('conflict', 'The initiating native conversation is unavailable.');
  const chat = service.store.aiChats.chat(metadata.chat_id);
  const scoped = context.tools;
  const host = service.directory.get(grant.target).host;
  const contextFacts = {
    ...facts(service.store, chat, scoped, context.now),
    guide: toolGuide(
      scoped.list().map((tool) => tool.name),
      discoveryAvailable(scoped.list()) ? 'discovery' : 'declarations',
    ),
    executionHost:
      grant.target.kind === 'server'
        ? "the home's own server"
        : `the selected ${host.platform} device ${JSON.stringify(host.name)}`,
    role: context.role,
    toolIndex: '',
    catalogue: '',
  };
  return [
    stablePrompt(contextFacts),
    projectWorkspaceContext(grant.storage_binding, grant.cwd),
    turnPrompt(contextFacts),
  ]
    .filter((text) => text !== '')
    .join('\n\n');
}
