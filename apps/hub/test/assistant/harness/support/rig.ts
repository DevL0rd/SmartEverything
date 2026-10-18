import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach } from 'vitest';
import {
  AI_HARNESS_PROTOCOL_VERSION,
  type AiChatRow,
  type AiHarnessHost,
  type AiHarnessTarget,
  type AiModelRoute,
  type AiModelRouteSelection,
  type HarnessRuntimeReceipt,
  type HarnessRuntimeRequest,
  type NodeHello,
} from '@smarteverything/domain';
import type { HarnessAuthority } from '@smarteverything/harness';
import { describeComputer } from '../../../../src/computers/computer-device';
import { HarnessRoutes } from '../../../../src/harness/routes';
import { HarnessService } from '../../../../src/harness/service';
import type { ChatOwner } from '../../../../src/assistant/chat-directory';
import { Catalogue } from '../../../../src/openrouter/catalogue';
import { OpenRouterClient } from '../../../../src/openrouter/client';
import { systemClock } from '../../../../src/clock';
import { testLogger } from '../../../support/logs';
import { testStore, type TestStore } from '../../../support/store';

const HELLO: NodeHello = {
  machineId: 'a'.repeat(32),
  hostname: 'desk',
  os: { name: 'Linux', kernel: '6.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  features: [],
  role: 'pc',
  power: [],
  actions: [],
  permissions: [],
};

type HostScript = (request: HarnessRuntimeRequest) => HarnessRuntimeReceipt | undefined;

export interface FakeHost {
  readonly target: AiHarnessTarget;
  readonly label: string;
  readonly requests: HarnessRuntimeRequest[];
  readonly held: Map<string, number>;
  script: HostScript | undefined;
}

export interface Rig {
  readonly opened: TestStore;
  readonly service: HarnessService;
  readonly owner: ChatOwner;
  readonly clientId: string;
  readonly authority: HarnessAuthority;
  readonly route: AiModelRouteSelection;
  readonly hub: FakeHost;
  readonly desk: FakeHost;
  readonly calls: string[];
  readonly newChat: (target: AiHarnessTarget) => AiChatRow;
  readonly close: () => Promise<void>;
}

function receipt(
  request: HarnessRuntimeRequest,
  state: HarnessRuntimeReceipt['state'],
): HarnessRuntimeReceipt {
  return {
    operation_id: randomUUID(),
    session_id: 'session_id' in request ? request.session_id : request.claim.session_id,
    epoch: 'expected_epoch' in request ? request.expected_epoch : request.claim.epoch,
    state,
    durable_seq: -1,
  };
}

const ACKNOWLEDGED: Partial<Record<HarnessRuntimeRequest['kind'], HarnessRuntimeReceipt['state']>> =
  {
    open: 'ready',
    close: 'closed',
  };

export function acknowledge(request: HarnessRuntimeRequest): HarnessRuntimeReceipt {
  return receipt(request, ACKNOWLEDGED[request.kind] ?? 'accepted');
}

function manifest(): NonNullable<AiHarnessHost['manifest']> {
  return {
    protocol: AI_HARNESS_PROTOCOL_VERSION,
    revision: 'test-revision',
    features: [],
    tools: [],
    permission_change: true,
    permissions: [
      { sandbox: 'danger-full-access', approval: 'never' },
      { sandbox: 'workspace-write', approval: 'on-request' },
      { sandbox: 'read-only', approval: 'on-request' },
    ],
  };
}

export async function harnessRig(): Promise<Rig> {
  const opened = await testStore(() => new Date());
  const { store } = opened;
  const owner = store.clients.create(
    { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  const profileId = store.profiles.activeOf(owner.id).id;
  const catalogue = new Catalogue({
    models: store.aiModels,
    client: new OpenRouterClient({ fetch, key: (): null => null }),
    clock: systemClock,
    log: testLogger('catalogue'),
  });
  const routes = new HarnessRoutes(catalogue, () => false);
  const route = ready(profileId);
  const service = new HarnessService(store, routes, () => undefined, {
    dataDirectory: opened.directory,
    clock: systemClock,
  });
  const device = computerDevice(store);
  const calls: string[] = [];
  const hub = register(service, { kind: 'server' }, 'hub', calls);
  const desk = register(service, { kind: 'device', device_id: device }, 'desk', calls);
  routes.publish(route);
  return {
    opened,
    service,
    owner: { profileId, role: 'owner' },
    clientId: owner.id,
    authority: { kind: 'manual', profileId },
    route: selection(route),
    hub,
    desk,
    calls,
    newChat: (target) => newChat(service, profileId, selection(route), target),
    close: () => opened.close(),
  };
}

function computerDevice(store: TestStore['store']): string {
  const discovered = describeComputer(HELLO, 'pc', [], { power: [], machine: [] });
  const [row] = store.devices.upsert([
    { ...discovered, parentId: null, providerRoom: null, roomId: null, online: true },
  ]);
  if (row === undefined) throw new Error('The test computer was not stored.');
  return row.id;
}

function ready(profileId: string): AiModelRoute {
  return {
    id: randomUUID(),
    profile_id: profileId,
    supplier: { kind: 'server' },
    subscriber_id: profileId,
    auth: { provider: 'anthropic', kind: 'claude-subscription-oauth' },
    billing: 'subscription-only',
    fallback: 'none',
    background_authorized: true,
    capability_revision: 'caps-1',
    state: 'ready',
    models: [
      {
        id: 'model-a',
        name: 'Model A',
        capabilities: {
          revision: 'caps-1',
          input_modalities: ['text'],
          output_modalities: ['text'],
          reasoning: false,
          efforts: [],
          local_tools: true,
          context_tokens: 200_000,
          discovered_at: '2026-10-08T09:00:00.000Z',
        },
      },
    ],
  };
}

function selection(route: AiModelRoute): AiModelRouteSelection {
  return {
    route_id: route.id,
    capability_revision: route.capability_revision,
    model: 'model-a',
    effort: null,
  };
}

function register(
  service: HarnessService,
  target: AiHarnessTarget,
  label: string,
  calls: string[],
): FakeHost {
  const fake: FakeHost = { target, label, requests: [], held: new Map(), script: undefined };
  const host: AiHarnessHost = {
    target,
    name: target.kind === 'server' ? 'Hub' : 'Desk',
    online: true,
    runtime_instance: randomUUID(),
    connection_generation: randomUUID(),
    manifest: manifest(),
    workspace: {
      home_directory: '/home/test',
      default_directory: '/home/test',
      available: true,
      reason: null,
    },
    unavailable_reason: null,
    platform: 'linux',
  };
  service.directory.register({
    actor: { kind: target.kind === 'server' ? 'server' : 'node', id: randomUUID() },
    host,
    hasSession: (id, epoch) => fake.held.get(id) === epoch,
    execute: (_id, request): Promise<HarnessRuntimeReceipt> => {
      fake.requests.push(request);
      calls.push(`${label}:${request.kind}`);
      const receipt = fake.script?.(request) ?? acknowledge(request);
      if (request.kind === 'open' && receipt.state === 'ready')
        fake.held.set(request.claim.session_id, request.claim.epoch);
      if (request.kind === 'close' && receipt.state === 'closed')
        fake.held.delete(request.session_id);
      return Promise.resolve(receipt);
    },
  });
  return fake;
}

function newChat(
  service: HarnessService,
  profileId: string,
  route: AiModelRouteSelection,
  target: AiHarnessTarget,
): AiChatRow {
  return service.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Switching chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: {
      kind: 'dsh',
      execution_target: target,
      session_id: null,
      model_route_id: route.route_id,
      model: route.model,
      effort: route.effort,
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    },
  });
}

export function useRig(assign: (rig: Rig) => void): void {
  let current: Rig | undefined;
  beforeEach(async () => {
    current = await harnessRig();
    assign(current);
  });
  afterEach(async () => {
    await current?.close();
  });
}
