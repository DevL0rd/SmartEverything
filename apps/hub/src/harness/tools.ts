import { toolMediaReferences } from '@smarteverything/harness/process';
import { openRouterSearchAvailable } from '../assistant/web-search-supplier';
import { executionRole, eventAuthority } from '../assistant/turn-authority';
import { reachesNativeBridge } from './native-bridge';
import { z } from 'zod';
import { JSON_VALUE, ApiError, HARNESS_CENTRAL_RESULT } from '@smarteverything/domain';
import type { HARNESS_CENTRAL_CATALOGUE } from '@smarteverything/domain';
import type { Context } from '@deepseek-ai/cordis';
import { harnessToolSchema } from './tool-schema';
import type { ToolCallId, ContentBlock } from '@deepseek-ai/dsh-llm';
import type { HarnessServerToolAccess, HarnessAuthority } from '@smarteverything/harness';
import { toolAdmission, type ToolAdmission } from '../ai-tools/tool-admission';
import { forwardedCall, type ToolHub } from '../ai-tools/tool-hub';
import type { ToolCaller, ToolSpec, HubToolResult } from '../ai-tools/hub-tool';
import {
  centralToolSpecs,
  centralToolCatalogue,
  centralToolDeclarationNames,
} from './tool-declarations';
import { effectiveTools } from '../assistant/coordination/grants';
import { DISCOVERY_NAMES } from '../ai-tools/tool-discovery';
import { META_TOOL_NAMES } from '../ai-tools/tool-sets';
import { scopedHub } from '../assistant/coordination/scoped-tools';
import type { HarnessService } from './service';

const CHAT_FOLDER_TOOLS: ReadonlySet<string> = new Set([
  'read_project_files',
  'edit_project_files',
]);
const IMAGE_MIME = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export class HarnessHubTools implements HarnessServerToolAccess {
  private readonly admit: ToolAdmission;
  constructor(
    private readonly service: HarnessService,
    private readonly tools: ToolHub,
  ) {
    this.admit = toolAdmission(service.store);
  }
  nativeAccess(id: string): boolean {
    return (
      this.service.storage.grant(id).target.kind === 'server' && this.caller(id).role === 'owner'
    );
  }
  hubToolNames(_authority: HarnessAuthority): readonly string[] {
    return centralToolSpecs(this.tools).map((tool) => tool.name);
  }
  deny(
    authority: HarnessAuthority,
    execution: Parameters<HarnessServerToolAccess['deny']>[1],
  ): string | undefined {
    if (execution.agent === undefined) return 'Hub actions require an owned native conversation.';
    const session = this.session(execution.agent.id);
    if (session.caller.profileId !== authority.profileId)
      return 'This initiating profile no longer owns the tool grant.';
    const args = z.record(z.string(), z.unknown()).parse(execution.arguments);
    const checked = this.restricted(session).check(execution.name, args);
    return checked.ok ? undefined : checked.reason;
  }
  install(ctx: Context): void {
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
    const session = this.session(id);
    const hub = this.restricted(session);
    const target = forwardedCall(name, args);
    const checked = hub.check(target.name, target.arguments);
    if (!checked.ok) throw new HubCapabilityFailure(name, checked.reason);
    return { caller: this.admit(target.name, target.arguments, session.caller), hub };
  }
  async call(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<HubToolResult> {
    const { caller, hub } = this.authorizeCall(id, name, args);
    const result = await hub.callAdmitted(name, args, caller);
    if (typeof result.response['error'] === 'string')
      throw new HubCapabilityFailure(name, result.response['error']);
    return result;
  }
  async transportCall(
    authorized: { readonly caller: ToolCaller; readonly hub: ToolHub },
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<z.infer<typeof HARNESS_CENTRAL_RESULT>> {
    const result = await authorized.hub.callAdmitted(name, args, authorized.caller);
    return HARNESS_CENTRAL_RESULT.parse({
      response: result.response,
      pictures: result.pictures.map((picture) => ({
        mime: picture.mimeType,
        data: picture.data.toString('base64'),
      })),
    });
  }
  scoped(id: string): ToolHub {
    return this.restricted(this.session(id));
  }
  caller(id: string): ToolCaller {
    return this.session(id).caller;
  }
  private restricted({ caller, chatId, server }: HubSession): ToolHub {
    const chat = this.service.store.aiChats.chat(chatId);
    const granted = caller.authority?.tools ?? null;
    const grantedNames = granted === null ? null : new Set(granted);
    const search = openRouterSearchAvailable(this.service, chat);
    const hub = scopedHub(this.tools, effectiveTools(this.service.store, chat))?.restrict(
      (tool) =>
        (tool.name !== 'web_search' || search) &&
        !(server && CHAT_FOLDER_TOOLS.has(tool.name)) &&
        !reachesNativeBridge(tool.name) &&
        (grantedNames === null ||
          grantedNames.has(tool.name) ||
          tool.name === META_TOOL_NAMES.call ||
          DISCOVERY_NAMES.has(tool.name)),
    );
    if (hub === undefined)
      throw new ApiError('forbidden', 'This conversation has no available hub capabilities.');
    return hub;
  }
  private session(id: string): HubSession {
    const { store, storage } = this.service;
    const grant = storage.grant(id);
    const metadata = store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native tool conversation is absent.');
    const authority =
      grant.event_id === null
        ? undefined
        : eventAuthority(store, store.assistantEvents.event(grant.event_id));
    return {
      chatId: metadata.chat_id,
      server: grant.target.kind === 'server',
      caller: {
        ...(authority === undefined ? {} : { authority }),
        profileId: grant.profile_id,
        role:
          grant.role === 'owner' &&
          (authority === undefined || executionRole(authority) === 'owner')
            ? 'owner'
            : 'member',
        chatId: metadata.chat_id,
        clientId: grant.client_id,
        via: grant.authority.kind === 'trigger' ? 'automation' : 'chat',
      },
    };
  }
}

interface HubSession {
  readonly caller: ToolCaller;
  readonly chatId: string;
  readonly server: boolean;
}

class HubCapabilityFailure extends ApiError {
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super('invalid_request', message);
  }
}
