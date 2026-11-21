import { z } from 'zod';
import { ApiError, HARNESS_CENTRAL_CONTEXT, JSON_VALUE } from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import type {
  HomeTool,
  HomeToolCall,
  HomeToolResult,
  HomeToolSession,
  HomeToolTransport,
} from '@smarteverything/harness/process';
import type { ToolHub } from '../ai-tools/tool-hub';
import { withSignal } from '../server/request-signal';
import { withCentralToolAuthority } from './central-tool-authority';
import { centralHomeTools } from './tool-declarations';
import type { HarnessService } from './service';
import type { HarnessHubTools } from './tools';
import { hubSession } from './hub-session';
import { harnessPrompt } from './prompt';

const IMAGE_MIME = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const RESPONSE = z.record(z.string(), JSON_VALUE);

export class HubHomeTools implements HomeToolTransport {
  private cached: readonly HomeTool[] | undefined;

  constructor(
    private readonly access: HarnessHubTools,
    private readonly hub: ToolHub,
  ) {}

  tools(): readonly HomeTool[] {
    this.cached ??= centralHomeTools(this.hub);
    return this.cached;
  }

  changes(listener: () => void): () => void {
    return this.hub.changes(() => {
      this.cached = undefined;
      listener();
    });
  }

  session(sessionId: string): Promise<HomeToolSession> {
    return Promise.resolve({
      tools: this.tools(),
      declared: this.access.declarationNames(this.access.session(sessionId)),
    });
  }

  async call(request: HomeToolCall): Promise<HomeToolResult> {
    const result = await withSignal(request.signal, () =>
      this.access.call(request.sessionId, request.name, request.arguments, request.callId),
    );
    return {
      response: RESPONSE.parse(result.response),
      pictures: result.pictures.map((picture) => ({
        mediaType: IMAGE_MIME.parse(picture.mimeType),
        data: picture.data.toString('base64'),
      })),
    };
  }
}

interface CentralPorts {
  readonly access: HarnessHubTools;
  readonly now: () => Date;
}
const ports = new WeakMap<HarnessService, CentralPorts>();
export function bindCentralHarness(
  service: HarnessService,
  access: HarnessHubTools,
  now: () => Date,
): void {
  ports.set(service, { access, now });
}
function centralPorts(service: HarnessService): CentralPorts {
  const installed = ports.get(service);
  if (installed === undefined)
    throw new ApiError('conflict', 'Central native tool access is not installed.');
  return installed;
}
export function centralCatalogue(
  service: HarnessService,
): ReturnType<HarnessHubTools['catalogue']> {
  return centralPorts(service).access.catalogue();
}
export async function centralTransport(
  service: HarnessService,
  input: HarnessTransportRequest,
): Promise<unknown> {
  const request = input.request;
  if (request.operation === 'context') {
    await service.storage.verify(request.claim, input);
    return centralContext(service, request.claim.session_id);
  }
  if (request.operation === 'tool') {
    return centralTool(service, input, request);
  }
  throw new ApiError('invalid_request', 'Expected scoped central native access.');
}
async function centralTool(
  service: HarnessService,
  input: HarnessTransportRequest,
  request: Extract<HarnessTransportRequest['request'], { operation: 'tool' }>,
): ReturnType<HarnessHubTools['transportCall']> {
  const { claim, event_id: eventId, call_id: callId, name, arguments: args } = request;
  const verify = async (): Promise<void> => {
    await service.storage.verify(claim, input);
  };
  return withCentralToolAuthority(
    service,
    claim.session_id,
    { callId, verify },
    async (authority) => {
      authority.authorize(eventId);
      const { access } = centralPorts(service);
      return await access.transportCall(
        await access.authorizeCall(await access.read(claim.session_id), name, args),
        name,
        args,
      );
    },
  );
}

async function centralContext(
  service: HarnessService,
  id: string,
): Promise<z.infer<typeof HARNESS_CENTRAL_CONTEXT>> {
  const { access, now } = centralPorts(service);
  const mirrored = await service.sessions.read(id);
  const session = hubSession(mirrored);
  const prompt = harnessPrompt(service, mirrored, {
    tools: access.restricted(session),
    now: now(),
    role: session.caller.role,
  });
  return HARNESS_CENTRAL_CONTEXT.parse({
    ...prompt,
    event_id: mirrored.grant.event_id,
    tools: access.catalogue(session),
    declared_tool_names: access.declarationNames(session),
    compact_at_percent: service.store.live.home.assistant.read().compact_at_percent,
  });
}
