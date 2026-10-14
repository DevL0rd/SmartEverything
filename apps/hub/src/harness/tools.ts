import { providerHubOsBan } from '../assistant/engines/computer/tool-authority';
import { toolMediaReferences } from '@smarteverything/harness/process';
import {
  openRouterSearchAvailable,
  limitSearchToolSchemas,
} from '../assistant/web-search-supplier';
import { inheritedOrigin, validateAuthorityGraph } from '../assistant/authority-inheritance';
import {
  executionRole,
  principalAuthority,
  bindExecutionHost,
  bindExecutionToolAdmission,
  eventAuthority,
  currentExecutionAuthority,
  currentExecutionAuthorities,
  validateExecutionAuthority,
  withExecutionAuthority,
} from '../assistant/execution-authority';
import { ServerToolPolicy } from './server-tool-policy';
import { z } from 'zod';
import { JSON_VALUE, ApiError, HARNESS_CENTRAL_RESULT } from '@smarteverything/domain';
import type { HARNESS_CENTRAL_CATALOGUE } from '@smarteverything/domain';
import type { Context } from '@deepseek-ai/cordis';
import { harnessToolSchema } from './tool-schema';
import type { ToolCallId, ContentBlock } from '@deepseek-ai/dsh-llm';
import type { HarnessServerToolAccess, HarnessAuthority } from '@smarteverything/harness';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { ToolCaller, ToolSpec, HubToolResult } from '../ai-tools/hub-tool';
import { META_TOOL_NAMES } from '../ai-tools/tool-sets';
import {
  centralToolSpecs,
  centralToolCatalogue,
  centralToolDeclarationNames,
} from './tool-declarations';
import { effectiveTools } from '../assistant/coordination/grants';
import { DISCOVERY_NAMES } from '../ai-tools/tool-discovery';
import { scopedHub } from '../assistant/coordination/scoped-tools';
import type { HarnessService } from './service';

const IMAGE_MIME = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export class HarnessHubTools implements HarnessServerToolAccess {
  private readonly policy: ServerToolPolicy;
  constructor(
    private readonly service: HarnessService,
    private readonly tools: ToolHub,
    localComputer: (id: string) => boolean,
  ) {
    this.policy = new ServerToolPolicy(service.store, localComputer);
    bindExecutionHost(service.store, localComputer);
    bindExecutionToolAdmission(service.store, (name, args, authority): void => {
      this.admit(name, args, {
        authority,
        profileId: authority.profile_id,
        role: 'member',
        chatId: service.store.assistantEvents.event(authority.event_id).chat_id,
        clientId: authority.client_id,
        via: 'plugin',
      });
    });
    tools.setAdmission((name, args, caller) => this.admit(name, args, caller));
  }
  private admit(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): ToolCaller {
    const authority = this.toolAuthority(caller);
    if (authority === undefined) return caller;
    this.admitInherited(name, args, authority, caller.profileId);

    validateExecutionAuthority(this.service.store, authority);
    if (authority.profile_id !== caller.profileId)
      throw new ApiError('forbidden', 'Tool caller changed its initiating profile.');
    if (!this.scopeAllows(authority, name))
      throw new ApiError('forbidden', 'The current initiating grant does not expose this tool.');
    const refusal = withExecutionAuthority(authority, () =>
      authority.hub_os_ban || providerHubOsBan() ? this.policy.refusal(name, args) : undefined,
    );
    if (refusal !== undefined) throw new ApiError('forbidden', refusal);
    return this.admittedCaller(caller, authority);
  }
  private admittedCaller(
    caller: ToolCaller,
    authority: Parameters<typeof validateExecutionAuthority>[1],
  ): ToolCaller {
    const origin = inheritedOrigin([
      authority,
      ...currentExecutionAuthorities(),
      {
        plugin_id: caller.pluginId ?? null,
        requester: caller.pluginRequester ?? null,
      },
    ]);
    return {
      ...caller,
      authority,
      clientId: authority.client_id,
      role: this.principalRole(caller, authority),
      ...(origin.plugin_id === null ? {} : { pluginId: origin.plugin_id }),
      ...(origin.requester === null ? {} : { pluginRequester: origin.requester }),
    };
  }
  private admitInherited(
    name: string,
    args: Readonly<Record<string, unknown>>,
    authority: Parameters<typeof validateExecutionAuthority>[1],
    profile: string,
  ): void {
    for (const source of [authority, ...currentExecutionAuthorities()])
      for (const scope of validateAuthorityGraph(this.service.store, source)) {
        if (scope.event_id === authority.event_id) continue;
        this.admitScope(name, args, scope, profile);
      }
  }
  private principalRole(
    caller: ToolCaller,
    authority: Parameters<typeof validateExecutionAuthority>[1],
  ): ToolCaller['role'] {
    for (const source of [authority, ...currentExecutionAuthorities()]) {
      if (executionRole(this.service.store, source) === 'member') return 'member';
    }
    return caller.role;
  }
  private admitScope(
    name: string,
    args: Readonly<Record<string, unknown>>,
    authority: Parameters<typeof validateExecutionAuthority>[1],
    profile: string,
  ): void {
    validateExecutionAuthority(this.service.store, authority);
    if (authority.profile_id !== profile || !this.scopeAllows(authority, name))
      throw new ApiError('forbidden', 'The inherited initiating scope does not expose this tool.');
    const refusal = withExecutionAuthority(authority, () =>
      authority.hub_os_ban || providerHubOsBan() ? this.policy.refusal(name, args) : undefined,
    );
    if (refusal !== undefined) throw new ApiError('forbidden', refusal);
  }
  private toolAuthority(caller: ToolCaller): ReturnType<typeof currentExecutionAuthority> {
    const own =
      caller.authority ??
      currentExecutionAuthority() ??
      (caller.chatId === null
        ? undefined
        : this.service.store.harnessRecovery.latestAuthority(caller.chatId));
    return principalAuthority(this.service.store, [
      ...(own === undefined ? [] : [own]),
      ...currentExecutionAuthorities(),
    ]);
  }
  admitOperation(name: string, args: Readonly<Record<string, unknown>>): void {
    for (const authority of currentExecutionAuthorities()) {
      validateExecutionAuthority(this.service.store, authority);
      if (!authority.hub_os_ban && !providerHubOsBan()) continue;
      const refusal = withExecutionAuthority(authority, () =>
        this.policy.refusal('call_operation', { operation: name, arguments: args }),
      );
      if (refusal !== undefined) throw new ApiError('forbidden', refusal);
    }
  }
  hubToolNames(_authority: HarnessAuthority): readonly string[] {
    return centralToolSpecs(this.tools).map((tool) => tool.name);
  }
  deny(
    authority: HarnessAuthority,
    execution: Parameters<HarnessServerToolAccess['deny']>[1],
  ): string | undefined {
    if (execution.agent === undefined) return 'Hub actions require an owned native conversation.';
    const caller = this.caller(execution.agent.id);
    if (caller.profileId !== authority.profileId)
      return 'This initiating profile no longer owns the tool grant.';
    const refusal = this.policy.refusal(
      execution.name,
      z.record(z.string(), z.unknown()).parse(execution.arguments),
    );
    if (refusal !== undefined) return refusal;
    const scoped = this.scoped(execution.agent.id);
    const checked = scoped.check(
      execution.name,
      z.record(z.string(), z.unknown()).parse(execution.arguments),
    );
    return checked.ok ? undefined : checked.reason;
  }
  install(ctx: Context): void {
    limitSearchToolSchemas(ctx, this.service);
    const disposers = new Map<string, () => void>();
    const registered = new Set<string>();
    const contents = new Map<ToolCallId, ContentBlock[]>();
    const update = (): void => {
      for (const dispose of disposers.values()) dispose();
      disposers.clear();
      for (const tool of centralToolSpecs(this.tools)) {
        registered.add(tool.name);
        disposers.set(tool.name, ctx.tools.register(this.definition(ctx, tool, contents)));
      }
    };
    update();
    ctx.effect(() => this.tools.changes(update));
    ctx.effect(() => (): void => {
      for (const dispose of disposers.values()) dispose();
    });
    ctx.on('tools/result', (execution) => {
      contents.delete(execution.callId);
    });
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      const result = await next();
      if (context.agent === undefined) return result;
      const declared = new Set(this.declarationNames(context.agent.id));
      result.tools = result.tools.filter(
        (tool) => !registered.has(tool.name) || declared.has(tool.name),
      );
      return result;
    });
  }
  private definition(
    ctx: Context,
    tool: ToolSpec,
    contents: Map<ToolCallId, ContentBlock[]>,
  ): Parameters<Context['tools']['register']>[0] {
    const parameters = harnessToolSchema(tool.inputSchema);
    return {
      name: tool.name,
      description: tool.description,
      parameters: { ...parameters },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (raw, execution): Promise<unknown> => {
        if (execution.agent === undefined)
          throw new ApiError('forbidden', 'Hub tools require a native conversation.');
        const args = z.record(z.string(), z.unknown()).parse(raw);
        const result = await this.call(execution.agent.id, tool.name, args);
        const blocks: ContentBlock[] = [{ type: 'text', text: JSON.stringify(result.response) }];
        for (const picture of result.pictures) {
          const admitted = await ctx.attachments.admitPromptContent([
            {
              type: 'image',
              mediaType: IMAGE_MIME.parse(picture.mimeType),
              data: picture.data.toString('base64'),
            },
          ]);
          blocks.push(...admitted);
        }
        contents.set(execution.callId, toolMediaReferences(blocks, result.response));
        return JSON_VALUE.parse(result.response);
      },
      projectContent: (execution) => contents.get(execution.callId),
    };
  }
  catalogue(id?: string): z.infer<typeof HARNESS_CENTRAL_CATALOGUE> {
    return centralToolCatalogue(id === undefined ? this.tools : this.scoped(id));
  }
  declarationNames(id: string): readonly string[] {
    return centralToolDeclarationNames(this.scoped(id));
  }
  authorizeCall(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): { readonly caller: ToolCaller; readonly hub: ToolHub } {
    const caller = this.admit(name, args, this.caller(id));
    const refusal = this.policy.refusal(name, args);
    if (refusal !== undefined) throw new HubCapabilityFailure(name, refusal);
    const hub = this.scoped(id);
    const checked = hub.check(name, args);
    if (!checked.ok) throw new HubCapabilityFailure(name, checked.reason);
    return { caller, hub };
  }
  async call(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<HubToolResult> {
    const { caller, hub } = this.authorizeCall(id, name, args);
    const result = await hub.call(name, args, caller);
    if (typeof result.response['error'] === 'string')
      throw new HubCapabilityFailure(name, result.response['error']);
    return result;
  }
  async transportCall(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<z.infer<typeof HARNESS_CENTRAL_RESULT>> {
    const { caller, hub } = this.authorizeCall(id, name, args);
    const result = await hub.call(name, args, caller);
    return HARNESS_CENTRAL_RESULT.parse({
      response: result.response,
      pictures: result.pictures.map((picture) => ({
        mime: picture.mimeType,
        data: picture.data.toString('base64'),
      })),
    });
  }
  scoped(id: string): ToolHub {
    const grant = this.service.storage.grant(id);
    const metadata = this.service.store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native tool conversation is absent.');
    const chat = this.service.store.aiChats.chat(metadata.chat_id);
    const authority = this.caller(id).authority;
    const scopes =
      authority === undefined ? [] : validateAuthorityGraph(this.service.store, authority);
    const allowed = effectiveTools(this.service.store, chat);
    const search = openRouterSearchAvailable(this.service, chat);
    const hub = scopedHub(this.tools, allowed)?.restrict(
      (tool) =>
        (tool.name !== 'web_search' || search) &&
        scopes.every((scope) => this.scopeAllows(scope, tool.name)),
    );
    if (hub === undefined)
      throw new ApiError('forbidden', 'This conversation has no available hub capabilities.');
    return hub;
  }
  private scopeAllows(authority: NonNullable<ToolCaller['authority']>, name: string): boolean {
    if (name === META_TOOL_NAMES.call || DISCOVERY_NAMES.has(name)) return true;
    const event = this.service.store.assistantEvents.event(authority.event_id);
    const allowed = effectiveTools(
      this.service.store,
      this.service.store.aiChats.chat(event.chat_id),
    );
    return (
      (authority.tools === null || authority.tools.includes(name)) &&
      (allowed === null || allowed.includes(name))
    );
  }
  private callerRole(
    grant: ToolCaller['role'],
    client: ToolCaller['role'] | undefined,
    authority: ToolCaller['authority'],
  ): ToolCaller['role'] {
    if (authority !== undefined && executionRole(this.service.store, authority) === 'member')
      return 'member';
    return toolRole(grant, client, authority?.requester ?? undefined);
  }
  caller(id: string): ToolCaller {
    const grant = this.service.storage.grant(id);
    const metadata = this.service.store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native tool conversation is absent.');
    const client =
      grant.client_id === null ? undefined : this.service.store.clients.byId(grant.client_id);
    const authority =
      grant.event_id === null
        ? undefined
        : eventAuthority(
            this.service.store,
            this.service.store.assistantEvents.event(grant.event_id),
          );
    return {
      ...(authority === undefined ? {} : { authority }),
      profileId: grant.profile_id,
      role: this.callerRole(grant.role, client?.role, authority),
      chatId: metadata.chat_id,
      clientId: grant.client_id,
      via: grant.authority.kind === 'trigger' ? 'automation' : 'chat',
    };
  }
}

class HubCapabilityFailure extends Error {
  override readonly name = 'HubCapabilityFailure';
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super(message);
  }
}

function toolRole(
  grant: ToolCaller['role'],
  client: ToolCaller['role'] | undefined,
  requester: ToolCaller['pluginRequester'],
): ToolCaller['role'] {
  if (requester === 'unlisted') return 'member';
  return grant === 'owner' && client === 'owner' ? 'owner' : 'member';
}
