import { bindHomeTools } from '@smarteverything/harness/process';
import { openRouterSearchAvailable } from '../assistant/web-search-supplier';
import { reachesNativeBridge } from './native-bridge';
import { z } from 'zod';
import { ApiError, HARNESS_CENTRAL_RESULT, MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import type { HARNESS_CENTRAL_CATALOGUE } from '@smarteverything/domain';
import type { Context } from '@deepseek-ai/cordis';
import { HubHomeTools } from './central-transport';
import { withCentralToolAuthority } from './central-tool-authority';
import { verifyNativeMedia } from './native-media-authority';
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
import { scopedHub } from '../assistant/tool-scope';
import type { HarnessService } from './service';
import { hubSession, type HubSession } from './hub-session';

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
    const session = this.session(id);
    return session.server && session.caller.role === 'owner';
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
    z.record(z.string(), z.unknown()).parse(execution.arguments);
    return undefined;
  }
  install(ctx: Context): void {
    ctx.effect(() => bindHomeTools(ctx, new HubHomeTools(this, this.tools)));
  }
  catalogue(session?: HubSession): z.infer<typeof HARNESS_CENTRAL_CATALOGUE> {
    return centralToolCatalogue(session === undefined ? this.tools : this.restricted(session));
  }
  declarationNames(session: HubSession): readonly string[] {
    return centralToolDeclarationNames(this.restricted(session));
  }
  async authorizeCall(
    session: HubSession,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ readonly caller: ToolCaller; readonly hub: ToolHub }> {
    const hub = this.restricted(session);
    const target = forwardedCall(name, args);
    const checked = await hub.check(target.name, target.arguments, session.caller);
    if (!checked.ok) throw new HubCapabilityFailure(name, checked.reason);
    return { caller: await this.admit(target.name, target.arguments, session.caller), hub };
  }
  async call(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
    callId?: string,
  ): Promise<HubToolResult> {
    const { caller, hub } = await this.authorizeCall(this.session(id), name, args);
    const claim = await this.service.store.host.call(
      'dshSessions',
      'attached',
      id,
      caller.profileId,
    );
    const verifyWriter = async (): Promise<void> => {
      if (claim?.target.kind !== 'server')
        throw new ApiError('conflict', 'This native tool call has no active hub writer.');
      await verifyNativeMedia(this.service, claim);
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
  session(id: string): HubSession {
    return hubSession(this.service.sessions.get(id));
  }
  async read(id: string): Promise<HubSession> {
    return hubSession(await this.service.sessions.read(id));
  }
  restricted({ caller, chat, tools, server }: HubSession): ToolHub {
    const granted = caller.authority?.tools ?? null;
    const grantedNames = granted === null ? null : new Set(granted);
    const search = openRouterSearchAvailable(this.service, chat);
    const hub = scopedHub(this.tools, tools)?.restrict(
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
}

class HubCapabilityFailure extends ApiError {
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super('invalid_request', message);
  }
}
