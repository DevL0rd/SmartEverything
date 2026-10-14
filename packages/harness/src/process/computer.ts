import type { HarnessDispatcherOptions } from './dispatcher-options';
import { transferNativeImageNote } from './native-media-note';
import { SubscriptionInferenceSupplier } from '../providers/inference-supplier';
import type {
  SubscriptionInferenceRequest,
  SubscriptionInferenceResult,
} from '@smarteverything/domain';
import { NativePreviewTools, type NativePreviewAdapter } from './preview-tools';
import { NativePreviewFileTools } from './preview-file-tools';
import { ProcessSubscriptions } from './subscriptions';
import { ComputerModelRoutes } from './computer-models';
import { z } from 'zod';
import {
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_FILE_CAPABILITY,
  NODE_HARNESS_FRAME,
  HARNESS_PLUGIN_AGENT_RESULT,
} from '@smarteverything/domain';
import type {
  AiModelRoute,
  AiModelRouteSelection,
  AiSubscriptionHostStatus,
  HarnessSubscriptionRequest,
  HarnessDesiredConfiguration,
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
  NodeHarnessFrame,
} from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import { HARNESS_BOOT, processHarnessHost } from './boot';
import type { HarnessBoot } from './boot';
import { HarnessHttp } from './http';
import { ProcessHarnessConfiguration } from './configuration';
import { installedHarnessBuiltins } from '../composition/builtins';
import { sharedHarnessSkillAssets } from '../composition/github-skill-source';
import { DurablePluginAgents } from './plugin-agents';
import { CentralHarnessTools } from './central-tools';
import { NativeProjectFiles } from './project-files';
import { AI_PROJECT_RESULT } from '@smarteverything/domain';
import { HttpHarnessPersistence } from './persistence';
import { transferAttachments } from './attachments';
import { createHarnessDispatcher, type HarnessDispatcher } from './dispatcher';
import { guestHubFetch } from './guest-transport';

const DONE = z.object({ ok: z.literal(true) });
export class ComputerHarness {
  private stopped = false;
  private readonly sessions = new Map<string, number>();
  constructor(
    readonly hello: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
    private readonly dispatcher: HarnessDispatcher,
    private readonly persistence: HttpHarnessPersistence,
    private readonly ports: {
      readonly abort: AbortController;
      readonly models: ComputerModelRoutes;
      readonly subscriptions: ProcessSubscriptions;
      readonly supplier: SubscriptionInferenceSupplier;
      readonly configuration: ProcessHarnessConfiguration;
    },
  ) {}
  async execute(
    id: string,
    request: HarnessRuntimeRequest,
    route?: AiModelRoute,
  ): Promise<HarnessRuntimeReceipt> {
    if (this.stopped)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Computer execution channel is disconnected.',
      );
    if (request.kind === 'open' || request.kind === 'preflight')
      await this.installRoute(request.route, route);
    this.assertConnected();
    if (request.kind === 'open') this.sessions.set(request.claim.session_id, request.claim.epoch);
    const receipt = await this.dispatcher.execute(id, request);
    await this.ports.configuration.flush();
    if (request.kind === 'close') this.sessions.delete(request.session_id);
    return receipt;
  }
  private async installRoute(
    selection: AiModelRouteSelection,
    route: AiModelRoute | undefined,
  ): Promise<void> {
    if (
      route?.id !== selection.route_id ||
      route.capability_revision !== selection.capability_revision ||
      route.credential_generation !== selection.credential_generation ||
      !route.models.some((model) => model.id === selection.model)
    )
      throw new HarnessRuntimeError(
        'route_unavailable',
        'The initiating profile model route is unavailable.',
      );
    await this.ports.models.install(route);
  }
  private assertConnected(): void {
    if (this.stopped)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Computer execution channel was lost during admission.',
      );
  }
  subscription(request: HarnessSubscriptionRequest): Promise<AiSubscriptionHostStatus> {
    this.assertConnected();
    return this.ports.subscriptions.control(request);
  }
  inference(
    id: string,
    request: SubscriptionInferenceRequest,
    send: (result: SubscriptionInferenceResult) => Promise<void>,
  ): Promise<void> {
    this.assertConnected();
    return this.ports.supplier.start(id, request, send);
  }
  inferenceCredit(id: string, sequence: number): void {
    this.ports.supplier.credit(id, sequence);
  }
  inferenceCancel(id: string): void {
    this.ports.supplier.cancel(id);
  }
  reconnectSubscriptions(): Promise<void> {
    return this.ports.subscriptions.reconnect();
  }
  async configure(configuration: HarnessDesiredConfiguration): Promise<void> {
    this.assertConnected();
    await this.ports.configuration.configure(configuration);
  }
  async lose(id: string): Promise<void> {
    const epoch = this.sessions.get(id);
    const present = epoch !== undefined && this.dispatcher.hasSession(id, epoch);
    this.persistence.lose(id);
    if (present) await this.dispatcher.runtime.whenOwnershipLossSettled(id);
  }
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.ports.configuration.stop();
    this.ports.supplier.stop();
    this.ports.abort.abort('Computer execution channel lost; effects may be unknown.');
    for (const id of this.sessions.keys()) this.persistence.lose(id);
    await this.ports.subscriptions.stop();
    await this.dispatcher.dispose();
  }
}
export async function createComputerHarness(
  raw: HarnessBoot,
  publishSubscription?: (status: AiSubscriptionHostStatus) => Promise<void>,
  preview?: NativePreviewAdapter,
  injectedFetch: typeof fetch = fetch,
): Promise<ComputerHarness> {
  const boot = HARNESS_BOOT.parse(raw);
  if (boot.platform !== 'linux' && boot.platform !== 'macos')
    throw new HarnessRuntimeError(
      'runtime_unavailable',
      'Computer DSH execution supports Linux and macOS; Windows runtime is unavailable.',
    );
  const abort = new AbortController();
  const scopedFetch = guestHubFetch(boot, injectedFetch);
  const fetcher: typeof fetch = (input, init): Promise<Response> =>
    scopedFetch(input, {
      ...init,
      signal: AbortSignal.any([
        abort.signal,
        ...(input instanceof Request ? [input.signal] : []),
        ...(init?.signal === undefined || init.signal === null ? [] : [init.signal]),
      ]),
    });
  const http = new HarnessHttp(boot, fetcher);
  const persistence = new HttpHarnessPersistence(http);
  const subscriptions = await ProcessSubscriptions.open(
    boot,
    publishSubscription ?? subscriptionPublisher(http),
    fetcher,
  );
  const models = new ComputerModelRoutes(boot, persistence, fetcher, subscriptions);
  const configuration = new ProcessHarnessConfiguration(http);
  const dispatcher = await composeComputer({
    boot,
    http,
    persistence,
    models,
    configuration,
    ...(preview === undefined ? {} : { preview }),
  });
  configuration.bind(dispatcher.runtime);
  const hello = computerHello(boot, dispatcher, preview !== undefined);
  return new ComputerHarness(hello, dispatcher, persistence, {
    abort,
    models,
    configuration,
    subscriptions,
    supplier: new SubscriptionInferenceSupplier(boot.device_id, subscriptions),
  });
}
function composeComputer(input: {
  readonly preview?: NativePreviewAdapter;
  readonly boot: HarnessBoot;
  readonly http: HarnessHttp;
  readonly persistence: HttpHarnessPersistence;
  readonly models: ComputerModelRoutes;
  readonly configuration: ProcessHarnessConfiguration;
}): Promise<HarnessDispatcher> {
  const { boot, http, persistence, models, configuration } = input;
  const host = processHarnessHost(boot);
  const pluginAgents = new DurablePluginAgents(persistence, (request, signal) =>
    http.call(request, HARNESS_PLUGIN_AGENT_RESULT, signal),
  );
  const projectFiles = new NativeProjectFiles(persistence, (request, signal) =>
    http.call(request, AI_PROJECT_RESULT, signal),
  );
  return createHarnessDispatcher({
    projectFiles: projectFiles.execute,
    validateReferences: computerReferenceValidation(http, persistence),
    host,
    persistence,
    loadAttachments: (id, ids) => transferAttachments(http, persistence, id, ids),
    describeImage: (input) => transferNativeImageNote(http, persistence, input),
    desiredConfiguration: boot.configuration ?? { revision: 'initial', entries: [] },
    installedPlugins: installedHarnessBuiltins(
      host,
      sharedHarnessSkillAssets(host.stateDirectory),
      pluginAgents,
    ),
    configurationChanged: configuration.changed,
    configurationPending: configuration.pending,
    route: (id): AiModelRoute => models.get(id),
    installModelRoutes: (ctx): Promise<void> => {
      models.bind(ctx);
      pluginAgents.install(ctx);
      if (input.preview !== undefined) {
        new NativePreviewTools(http, persistence, input.preview).install(ctx);
        new NativePreviewFileTools(http, persistence, input.preview).install(ctx);
      }
      projectFiles.install(ctx);
      return new CentralHarnessTools(http, persistence).install(ctx);
    },
    publish: async (event): Promise<void> => {
      const frame = NODE_HARNESS_FRAME.parse({ ...http.identity(), type: 'harness_event', event });
      await http.call({ operation: 'publish', frame }, DONE);
    },
  });
}
function computerHello(
  boot: HarnessBoot,
  dispatcher: HarnessDispatcher,
  preview: boolean,
): Extract<NodeHarnessFrame, { type: 'harness_hello' }> {
  return NODE_HARNESS_FRAME.options[0].parse({
    device_id: boot.device_id,
    generation: boot.generation,
    runtime_instance: boot.runtime_instance,
    type: 'harness_hello',
    protocol: 1,
    capabilities: [
      HARNESS_CONFIGURATION_CAPABILITY,
      HARNESS_SUBSCRIPTION_CAPABILITY,
      ...(preview ? [AI_PREVIEW_CAPABILITY, AI_PREVIEW_FILE_CAPABILITY] : []),
    ],
    manifest: {
      ...dispatcher.runtime.manifest(),
      subscription_inference: { protocol: 1 },
      subscription_consumer: { protocol: 1 },
    },
    host: {
      name: boot.name,
      platform: boot.platform,
      home_directory: boot.home_directory,
      inbound_execution: true,
    },
  });
}

function subscriptionPublisher(
  http: HarnessHttp,
): (status: AiSubscriptionHostStatus) => Promise<void> {
  return async (status): Promise<void> => {
    await http.call(
      {
        operation: 'publish',
        frame: NODE_HARNESS_FRAME.parse({
          ...http.identity(),
          type: 'harness_subscription_status',
          status,
        }),
      },
      DONE,
    );
  };
}

function computerReferenceValidation(
  http: HarnessHttp,
  persistence: HttpHarnessPersistence,
): NonNullable<HarnessDispatcherOptions['validateReferences']> {
  return async (id, deliveryId, references, signal): Promise<void> => {
    const claim = persistence.claim(id);
    await persistence.verify(claim);
    await http.call(
      {
        operation: 'reference_validate',
        claim,
        delivery_id: deliveryId,
        references: [...references],
      },
      DONE,
      signal,
    );
    await persistence.verify(claim);
  };
}
