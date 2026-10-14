import { validateNativeReferences } from '../harness/reference-delivery';
import { hubPluginAgents, hubImageDescription } from './harness-native-ports';
import { NativeProjectFiles } from '@smarteverything/harness/process';
import { bindProjectFiles, nativeProjectFile } from '../harness/project-files';
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm';
import type { SubscriptionInferencePort } from '@smarteverything/harness';
import {
  authorizeHubSupplier,
  subscriptionInferenceConnection,
} from '../harness/supplier-inference';
import { HubHarnessConfiguration } from './harness-configuration';
import {
  bindCompactionPolicy,
  installedHarnessBuiltins,
  sharedHarnessSkillAssets,
  type HarnessHost,
  RemoteSubscriptionAdapter,
} from '@smarteverything/harness';
import type { Operations } from './operations';
import { installHubPrompt } from '../harness/prompt';
import { bindCentralHarness } from '../harness/central-transport';
import { ordinaryModelRequest } from '@smarteverything/harness/process';
import { meteredAccountingFetch } from '../harness/metered-accounting';
import { HarnessAttachments } from '../harness/attachments';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Context } from '@deepseek-ai/cordis';
import {
  createHarnessDispatcher,
  MeteredRouteAdapter,
  connectionDiagnosticFetch,
} from '@smarteverything/harness/process';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import { ApiError } from '@smarteverything/domain';
import type { AiModelRoute } from '@smarteverything/domain';
import { HarnessHubTools } from '../harness/tools';
import { LocalHarnessPersistence } from '../harness/local-persistence';
import type { ServerContext } from './context';
import type { BuildOptions } from './build';
import type { ToolHub } from '../ai-tools/tool-hub';

export async function startHubHarness(
  options: BuildOptions,
  context: ServerContext,
  tools: ToolHub,
  operations: Operations,
): Promise<HarnessDispatcher | null> {
  if (process.platform === 'win32') {
    registerUnavailableHub(context);
    return null;
  }
  const service = context.harness;
  const persistence = new LocalHarnessPersistence(service);
  const access = new HarnessHubTools(service, tools, (id) => context.computerAi.status(id).local);
  bindCentralHarness(service, access, () => options.clock.now(), {
    assistant: context.assistant,
    stateDirectory: join(options.dataDirectory, 'harness'),
  });
  bindProjectFiles(service, context.assistant.projects);
  operations.bindServiceAuthority(service.store);
  operations.bindExecutionAdmission((name, args): void => {
    access.admitOperation(name, args);
  });
  const platform = process.platform === 'darwin' ? 'macos' : 'linux';
  const runtimeInstance = randomUUID();
  const generation = randomUUID();
  const host: HarnessHost = {
    target: { kind: 'server' as const },
    name: 'Home hub',
    platform,
    homeDirectory: homedir(),
    stateDirectory: join(options.dataDirectory, 'harness'),
  };
  const configuration = new HubHarnessConfiguration(service, { runtimeInstance, generation }, () =>
    options.clock.now(),
  );
  const dispatcher = await composeHub({
    options,
    context,
    tools,
    persistence,
    access,
    host,
    configuration,
  });
  configuration.bind(dispatcher);
  registerHub(context, dispatcher, { platform, runtimeInstance, generation }, configuration);
  configuration.report(false);
  return dispatcher;
}
function composeHub(ports: {
  readonly options: BuildOptions;
  readonly context: ServerContext;
  readonly tools: ToolHub;
  readonly persistence: LocalHarnessPersistence;
  readonly access: HarnessHubTools;
  readonly host: HarnessHost;
  readonly configuration: HubHarnessConfiguration;
}): Promise<HarnessDispatcher> {
  const { options, context, tools, persistence, access, host, configuration } = ports;
  const projectFiles = hubProjectFiles(context, persistence);
  const pluginAgents = hubPluginAgents(ports);
  return createHarnessDispatcher({
    projectFiles: projectFiles.execute,
    validateReferences: (id, deliveryId, references, signal) =>
      validateNativeReferences(context.harness, id, deliveryId, references, signal),
    host,
    persistence,
    desiredConfiguration: context.harness.configuration.desired(),
    installedPlugins: installedHarnessBuiltins(
      host,
      sharedHarnessSkillAssets(host.stateDirectory),
      pluginAgents,
    ),
    configurationChanged: (): void => {
      configuration.changed();
    },
    configurationPending: (): void => {
      configuration.pending();
    },
    serverToolAccess: access,
    loadAttachments: (id, ids) =>
      new HarnessAttachments(context.harness, context.assistant.files).load(id, ids),
    describeImage: hubImageDescription(context, persistence),
    authority: (id) => context.harness.storage.grant(id).authority,
    route: (id) => supplierRoute(context, id),
    publish: (event) => {
      context.harness.publish(event);
      return Promise.resolve();
    },
    installModelRoutes: (ctx) => {
      projectFiles.install(ctx);
      pluginAgents.install(ctx);
      return installRoutes(ctx, { options, context, persistence, access, tools });
    },
  });
}
function registerUnavailableHub(context: ServerContext): void {
  context.harness.directory.register({
    actor: { kind: 'server', id: 'server' },
    host: {
      target: { kind: 'server' },
      name: 'Home hub',
      platform: 'windows',
      online: false,
      inbound_execution: false,
      runtime_instance: randomUUID(),
      connection_generation: randomUUID(),
      manifest: null,
      workspace: {
        home_directory: homedir(),
        default_directory: null,
        available: false,
        reason: 'Windows native composition is not installed yet.',
      },
      unavailable_reason:
        'Windows native composition is not installed yet. Existing home services remain available.',
    },
  });
}
function registerHub(
  context: ServerContext,
  dispatcher: HarnessDispatcher,
  identity: {
    readonly platform: 'linux' | 'macos' | 'windows';
    readonly runtimeInstance: string;
    readonly generation: string;
  },
  configuration: HubHarnessConfiguration,
): void {
  const { platform, runtimeInstance, generation } = identity;
  const service = context.harness;
  service.directory.register({
    actor: { kind: 'server', id: 'server' },
    host: {
      target: { kind: 'server' },
      name: 'Home hub',
      online: true,
      configuration_sync: true,
      platform,
      inbound_execution: true,
      runtime_instance: runtimeInstance,
      connection_generation: generation,
      manifest: dispatcher.runtime.manifest(),
      workspace: {
        home_directory: homedir(),
        default_directory: null,
        available: true,
        reason: null,
      },
      unavailable_reason: null,
    },
    configure: (desired): void => {
      configuration.configure(desired);
    },
    execute: (id, request) => dispatcher.execute(id, request),
    hasSession: (id, epoch) => dispatcher.hasSession(id, epoch),
  });
}
function supplierRoute(context: ServerContext, id: string): AiModelRoute {
  for (const profile of context.store.profiles.list()) {
    const route = context.harness.routes.list(profile.id).find((entry) => entry.id === id);
    if (route !== undefined) return route;
  }
  throw new ApiError('conflict', 'The selected supplier route is unavailable.');
}
interface HubModelPorts {
  readonly options: BuildOptions;
  readonly context: ServerContext;
  readonly persistence: LocalHarnessPersistence;
  readonly access: HarnessHubTools;
  readonly tools: ToolHub;
}
function installRoutes(ctx: Context, ports: HubModelPorts): Promise<void> {
  const { context, access, options } = ports;
  bindCompactionPolicy(ctx, async (id): Promise<number> => {
    await ports.persistence.verify(ports.persistence.claim(id));
    return context.store.assistantChat.settings().compact_at_percent;
  });
  const registrations = new Map<string, () => void>();
  const update = (): void => {
    for (const dispose of registrations.values()) dispose();
    registrations.clear();
    for (const profile of context.store.profiles.list()) {
      for (const route of context.harness.routes.list(profile.id)) {
        if (route.state !== 'ready') continue;
        const adapter =
          route.auth.provider === 'openrouter'
            ? routeAdapter(ctx, route, ports)
            : subscriptionAdapter(ctx, route, ports);
        registrations.set(route.id, ctx.llm.registerAdapter([route.id], adapter));
      }
    }
  };
  access.install(ctx);
  installHubPrompt(ctx, context.harness, {
    tools: (id) => access.scoped(id),
    role: (id) => access.caller(id).role,
    now: () => options.clock.now(),
  });
  update();
  ctx.effect(() => context.harness.routes.onChange(update));
  ctx.effect(() => context.openRouter.catalogue.onChange(update));
  ctx.effect(() => context.openRouter.keys.onChange(update));
  ctx.effect(() =>
    context.store.feed.subscribe((change) => {
      if (change.table === 'profiles') update();
    }),
  );
  ctx.effect(() => (): void => {
    for (const dispose of registrations.values()) dispose();
  });
  return Promise.resolve();
}

function routeAdapter(
  ctx: Context,
  route: AiModelRoute,
  ports: HubModelPorts,
): MeteredRouteAdapter {
  const { context, persistence } = ports;
  return new MeteredRouteAdapter(
    route,
    {
      key: (): Promise<string> => {
        const key = context.secrets.read().openrouterKey;
        if (key === null)
          throw new ApiError('conflict', 'The selected supplying account is unavailable.');
        return Promise.resolve(key);
      },
      fetch: (input): typeof fetch => {
        if (input.sessionId === undefined)
          throw new ApiError('forbidden', 'Metered inference requires its native session.');
        return accountingFetch(ports, route, input.sessionId);
      },
      authorize: async (input): Promise<void> => {
        if (input.sessionId === undefined)
          throw new ApiError('forbidden', 'Inference requires an owned native conversation.');
        const grant = context.harness.storage.grant(input.sessionId);
        context.harness.routes.selected(
          grant.profile_id,
          grant.route,
          grant.authority.kind === 'trigger',
        );
        if (
          grant.profile_id !== route.profile_id ||
          grant.route.route_id !== input.provider ||
          grant.route.model !== input.model
        )
          throw new ApiError(
            'forbidden',
            'Inference does not match this initiating conversation’s explicit route.',
          );
        await persistence.verify(persistence.claim(input.sessionId));
      },
    },
    { resolveAttachments: (): typeof ctx.attachments => ctx.attachments },
  );
}

function accountingFetch(
  ports: HubModelPorts,
  route: AiModelRoute,
  sessionId: string,
): typeof fetch {
  const { context, persistence, options } = ports;
  return meteredAccountingFetch(
    context.harness,
    sessionId,
    connectionDiagnosticFetch('hub_supplier', options.fetch),
    {
      verify: (): void => {
        const claim = persistence.claim(sessionId);
        context.store.dshSessions.verifyWriter(
          claim,
          context.harness.hostPrincipal(
            route.profile_id,
            context.harness.directory.get({ kind: 'server' }).host,
          ),
        );
      },
      ordinary_request: ordinaryModelRequest(),
    },
  );
}

function subscriptionAdapter(
  ctx: Context,
  route: AiModelRoute,
  ports: HubModelPorts,
): RemoteSubscriptionAdapter {
  const service = ports.context.harness;
  return new RemoteSubscriptionAdapter(
    route,
    {
      call: (request, signal): ReturnType<SubscriptionInferencePort['call']> => {
        const inference = subscriptionInferenceConnection(service, route).inference;
        if (inference === undefined)
          throw new ApiError(
            'conflict',
            'This supplier does not provide remote subscription inference.',
          );
        return inference.call(request, signal);
      },
    },
    (options) => authorizeHubSupplier(service, ports.persistence, route, options),
    {
      resolveAttachments: (): typeof ctx.attachments => ctx.attachments,
      resolveImageAccess: (attachments, ref) =>
        resolveImageAttachmentAccess(
          attachments,
          (path): string | undefined => ctx.get('fs')?.processPathFromHostPath(path),
          ref,
        ),
    },
  );
}

function hubProjectFiles(
  context: ServerContext,
  persistence: LocalHarnessPersistence,
): NativeProjectFiles {
  return new NativeProjectFiles(persistence, (request, signal) =>
    nativeProjectFile(context.harness, request, () => {
      signal.throwIfAborted();
      const grant = context.harness.storage.grant(request.claim.session_id);
      context.store.dshSessions.verifyWriter(
        request.claim,
        context.harness.hostPrincipal(
          grant.profile_id,
          context.harness.directory.get(grant.target).host,
        ),
      );
    }),
  );
}
