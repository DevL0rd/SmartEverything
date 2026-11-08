import { bindHomeTools } from '@smarteverything/harness/process';
import { openRouterSearchAvailable } from '../assistant/web-search-supplier';
import { executionRole, eventAuthority } from '../assistant/turn-authority';
import { reachesNativeBridge } from './native-bridge';
import { z } from 'zod';
import { ApiError, HARNESS_CENTRAL_RESULT, MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import type { HARNESS_CENTRAL_CATALOGUE } from '@smarteverything/domain';
import type { Context } from '@deepseek-ai/cordis';
import { HubHomeTools } from './central-transport';
import { withCentralToolAuthority } from './central-tool-authority';
import { nativeMediaAuthority } from './native-media-authority';
import type { HarnessServerToolAccess, HarnessAuthority } from '@smarteverything/harness';
import { toolAdmission, type ToolAdmission } from '../ai-tools/tool-admission';
import { forwardedCall, type ToolHub } from '../ai-tools/tool-hub';
import type { ToolCaller, HubToolResult } from '../ai-tools/hub-tool';
import {
  centralToolSpecs,
  centralToolCatalogue,
  centralToolDeclarationNames,
} from './tool-declarations';
import { META_TOOL_NAMES } from '../ai-tools/tool-sets';
import { effectiveTools, scopedHub } from '../assistant/tool-scope';
import type { HarnessService } from './service';

const CHAT_FOLDER_TOOLS: ReadonlySet<string> = new Set(['project_read', 'project_edit']);
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
    const checked = this.restricted(session).check(execution.name, args, session.caller);
    return checked.ok ? undefined : checked.reason;
  }
  install(ctx: Context): void {
    ctx.effect(() => bindHomeTools(ctx, new HubHomeTools(this, this.tools)));
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
    const checked = hub.check(target.name, target.arguments, session.caller);
    if (!checked.ok) throw new HubCapabilityFailure(name, checked.reason);
    return { caller: this.admit(target.name, target.arguments, session.caller), hub };
  }
  async call(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
    callId?: string,
  ): Promise<HubToolResult> {
    const { caller, hub } = this.authorizeCall(id, name, args);
    const claim = this.service.store.dshSessions.attached(id, caller.profileId);
    const verifyWriter = (): void => {
      if (claim?.target.kind !== 'server')
        throw new ApiError('conflict', 'This native tool call has no active hub writer.');
      nativeMediaAuthority(this.service, claim);
    };
    const result = await withCentralToolAuthority(
      this.service,
      id,
      { callId, verify: verifyWriter },
      () => hub.callAdmitted(name, args, callId === undefined ? caller : { ...caller, callId }),
    );
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
          MCP_DISCOVERY_TOOLS.has(tool.name)),
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
