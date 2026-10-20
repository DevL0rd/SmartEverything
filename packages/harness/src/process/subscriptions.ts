import { Logger, background } from '@smarteverything/logging';
import type { SubscriptionCredential, SubscriptionStorage } from '../credentials/contracts';
import type { SubscriptionModelCatalog } from '../providers/catalog';
import type { SubscriptionBillingSnapshot } from '../providers/billing';
import type { AiSubscriptionHostStatus, HarnessSubscriptionRequest } from '@smarteverything/domain';
import { HARNESS_SUBSCRIPTION_REQUEST } from '@smarteverything/domain';
import { SubscriptionCredentials } from '../credentials/service';
import { SubscriptionAuthorization } from '../authorization/service';
import { authorizeChatgptOnHost } from '../authorization/loopback';
import { discoverSubscriptionModels } from '../providers/catalog';
import { SubscriptionBillingAdmission } from '../providers/billing';
import { SubscriptionProviderError } from '../providers/errors';
import { SubscriptionEnrollmentInteraction } from './subscription-interaction';
import { subscriptionStatus } from './subscription-status';
import type { HarnessBoot } from './boot';

export class ProcessSubscriptions {
  private readonly requests = new Map<string, HarnessSubscriptionRequest>();
  private readonly states = new Map<string, AiSubscriptionHostStatus>();
  private readonly enrollments = new Map<string, SubscriptionEnrollmentInteraction>();
  private readonly tasks = new Set<Promise<void>>();
  private unsubscribe: (() => void) | undefined;
  private stopped = false;
  private readonly log = new Logger('hub.harness-subscriptions');
  private constructor(
    readonly authorization: SubscriptionAuthorization,
    readonly admission: SubscriptionBillingAdmission,
    private readonly boot: HarnessBoot,
    private readonly ports: {
      readonly publish: (status: AiSubscriptionHostStatus) => Promise<void>;
      readonly fetcher: typeof fetch;
    },
  ) {}
  static async open(
    boot: HarnessBoot,
    storage: SubscriptionStorage,
    publish: (status: AiSubscriptionHostStatus) => Promise<void>,
    fetcher: typeof fetch = fetch,
  ): Promise<ProcessSubscriptions> {
    await storage.exclusive(() => Promise.resolve());
    const credentials = new SubscriptionCredentials(storage, boot.device_id);
    const authorization = new SubscriptionAuthorization(credentials, fetcher);
    return new ProcessSubscriptions(
      authorization,
      new SubscriptionBillingAdmission(fetcher, authorization.claudeProfile),
      boot,
      { publish, fetcher },
    );
  }
  async reconnect(): Promise<void> {
    for (const id of await this.authorization.credentials.routes()) {
      const credential = await this.authorization.credentials.read(id);
      if (credential?.subscriberProfileId === undefined) continue;
      const request: HarnessSubscriptionRequest = {
        profile_id: credential.subscriberProfileId,
        route_id: id,
        provider:
          credential.kind === 'claude-subscription'
            ? 'claude'
            : credential.kind === 'codex-subscription'
              ? 'chatgpt-codex'
              : 'chatgpt',
        command: { kind: 'status' },
      };
      this.requests.set(id, request);
      await this.refresh(request);
    }
    this.unsubscribe = this.authorization.credentials.onChanged((id) => {
      const request = this.requests.get(id);
      if (request === undefined || this.enrollments.has(id) || this.stopped) return;
      this.track(
        this.emit(
          subscriptionStatus({
            boot: this.boot,
            request,
            state: 'failed',
            message:
              'The supplying account changed. Its prior route generation is invalidated until discovery completes.',
          }),
        )
          .then(() => this.refresh(request))
          .then(() => undefined),
      );
    });
  }
  inferenceFetch(): typeof fetch {
    return this.ports.fetcher;
  }
  inferenceRoute(id: string): AiSubscriptionHostStatus['route'] {
    return this.current(id).route;
  }
  async control(raw: HarnessSubscriptionRequest): Promise<AiSubscriptionHostStatus> {
    if (this.stopped)
      throw new SubscriptionProviderError(
        'PROVIDER_UNAVAILABLE',
        'Subscription host disconnected.',
      );
    const request = HARNESS_SUBSCRIPTION_REQUEST.parse(raw);
    const existing = await this.authorization.credentials.read(request.route_id);
    if (existing !== undefined && existing.subscriberProfileId !== request.profile_id)
      throw new SubscriptionProviderError(
        'AUTH_DENIED',
        'Subscription account belongs to another initiating profile.',
      );
    this.requests.set(request.route_id, request);
    switch (request.command.kind) {
      case 'status':
        return this.enrollments.has(request.route_id)
          ? this.current(request.route_id)
          : this.refresh(request);
      case 'enroll':
        return this.enroll(request);
      case 'answer':
        this.attempt(request.route_id, request.command.enrollment_id).answer(
          request.command.answer,
        );
        return this.current(request.route_id);
      case 'cancel':
        this.attempt(request.route_id, request.command.enrollment_id).abort.abort();
        return this.emit(
          subscriptionStatus({
            boot: this.boot,
            request,
            state: 'missing_login',
            message: 'Subscription sign-in cancelled.',
          }),
        );
      case 'disconnect':
        return this.disconnect(request);
    }
  }
  private async enroll(request: HarnessSubscriptionRequest): Promise<AiSubscriptionHostStatus> {
    if (this.enrollments.has(request.route_id))
      throw new SubscriptionProviderError(
        'AUTH_BUSY',
        'Cancel the current subscription sign-in first.',
      );
    const interaction = new SubscriptionEnrollmentInteraction(new AbortController(), (value) => {
      this.track(
        this.emit(
          subscriptionStatus({
            boot: this.boot,
            request,
            state: 'authorizing',
            message: value.message,
            interaction: value,
          }),
        ).then(() => undefined),
      );
    });
    this.enrollments.set(request.route_id, interaction);
    await this.emit(
      subscriptionStatus({
        boot: this.boot,
        request,
        state: 'authorizing',
        message: 'Starting subscription sign-in on this supplying host.',
      }),
    );
    const task = this.login(request, interaction)
      .then(async () => {
        interaction.signal.throwIfAborted();
        this.enrollments.delete(request.route_id);
        await this.refresh(request);
      })
      .catch((cause: unknown) => this.enrollmentFailed(request, interaction, cause))
      .finally(() => {
        interaction.settled();
        interaction.abort.abort('Subscription authorization settled.');
      });
    this.track(task);
    await interaction.wait();
    return this.current(request.route_id);
  }
  private async enrollmentFailed(
    request: HarnessSubscriptionRequest,
    interaction: SubscriptionEnrollmentInteraction,
    cause: unknown,
  ): Promise<void> {
    if (!(cause instanceof Error)) throw cause;
    this.enrollments.delete(request.route_id);
    if (this.stopped) return;
    await this.emit(
      subscriptionStatus({
        boot: this.boot,
        request,
        state: 'failed',
        message: interaction.signal.aborted
          ? 'Subscription sign-in cancelled or expired.'
          : 'Subscription sign-in failed. No API-key or alternate billing route was selected.',
      }),
    );
  }
  private login(
    request: HarnessSubscriptionRequest,
    interaction: SubscriptionEnrollmentInteraction,
  ): Promise<void> {
    if (request.provider === 'claude')
      return this.authorization.claude.login(request.route_id, interaction, request.profile_id);
    if (request.provider === 'chatgpt-codex')
      return this.authorization.codex.login(request.route_id, interaction, request.profile_id);
    return authorizeChatgptOnHost({
      authorization: this.authorization.chatgpt,
      routeId: request.route_id,
      subscriberProfileId: request.profile_id,
      signal: interaction.signal,
      openSystemBrowser: (url): Promise<void> => {
        interaction.notify({ type: 'auth_url', url });
        return Promise.resolve();
      },
      manualCallback: (signal) =>
        interaction.prompt({
          type: 'manual_code',
          message: 'Paste the complete callback URL if the browser is on another computer.',
          signal,
        }),
    });
  }
  private async refresh(request: HarnessSubscriptionRequest): Promise<AiSubscriptionHostStatus> {
    const signal = AbortSignal.timeout(30_000);
    const stored = await this.authorization.credentials.read(request.route_id);
    if (stored === undefined)
      return this.emit(
        subscriptionStatus({
          boot: this.boot,
          request,
          state: 'missing_login',
          message:
            'Sign in on this supplying computer. Subscription credentials remain on this host.',
        }),
      );
    try {
      const resolved = await this.authorization.resolve(request.route_id, signal);
      const credential = await this.identifyCredential(resolved, signal);
      const catalog = await discoverSubscriptionModels(credential, signal, this.ports.fetcher);
      const billing = await this.admission.inspect(credential, signal);
      const current = await this.authorization.credentials.read(request.route_id);
      if (
        current?.generation !== credential.generation ||
        (credential.kind === 'codex-subscription' &&
          JSON.stringify(current) !== JSON.stringify(credential))
      )
        throw new SubscriptionProviderError(
          'AUTH_INVALID',
          'Subscription account changed during status discovery.',
        );
      return await this.emit(this.discoveredStatus(request, credential, catalog, billing));
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
      return this.emit(
        subscriptionStatus({
          boot: this.boot,
          request,
          state:
            cause instanceof SubscriptionProviderError && cause.code === 'AUTH_DENIED'
              ? 'missing_scope'
              : 'failed',
          message:
            'Subscription model discovery or authorization could not be verified. Sign in again or refresh this host status.',
          credential: stored,
        }),
      );
    }
  }
  private async identifyCredential(
    credential: SubscriptionCredential,
    signal: AbortSignal,
  ): Promise<SubscriptionCredential> {
    if (credential.kind !== 'claude-subscription' || credential.identity !== undefined)
      return credential;
    try {
      return await this.authorization.claude.bindIdentity(credential, signal);
    } catch (cause) {
      signal.throwIfAborted();
      if (!(cause instanceof Error)) throw cause;
      this.log.warn('subscription.identity_unavailable', {
        reason: 'Claude own authenticated profile could not establish an enrolled identity.',
      });
      return credential;
    }
  }
  private discoveredStatus(
    request: HarnessSubscriptionRequest,
    credential: SubscriptionCredential,
    catalog: SubscriptionModelCatalog,
    billing: SubscriptionBillingSnapshot,
  ): AiSubscriptionHostStatus {
    let state: AiSubscriptionHostStatus['state'];
    if (catalog.models.length === 0) state = 'unsupported_model';
    else if (billing.state === 'disabled') state = 'ready';
    else state = billing.state === 'unavailable' ? 'billing_unavailable' : billing.state;
    return subscriptionStatus({
      boot: this.boot,
      request,
      state,
      message:
        catalog.models.length === 0
          ? 'The account discovered no model supported by this installed transport.'
          : billing.message,
      credential,
      catalog,
      billing,
    });
  }
  private async disconnect(request: HarnessSubscriptionRequest): Promise<AiSubscriptionHostStatus> {
    this.enrollments.get(request.route_id)?.abort.abort();
    const credential = await this.authorization.credentials.read(request.route_id);
    const confirmed =
      credential?.kind === 'chatgpt-subscription'
        ? (await this.authorization.chatgpt.signOut(request.route_id, AbortSignal.timeout(30_000)))
            .remoteRevocationConfirmed
        : false;
    if (credential?.kind !== 'chatgpt-subscription')
      await this.authorization.credentials.modify(request.route_id, () =>
        Promise.resolve({ credential: undefined, result: undefined }),
      );
    return this.emit(
      subscriptionStatus({
        boot: this.boot,
        request,
        state: 'missing_login',
        message:
          'Local subscription credential removed. Claude and Codex remote sessions must also be revoked in provider account settings.',
        remoteRevocationConfirmed: confirmed,
      }),
    );
  }
  private attempt(route: string, id: string): SubscriptionEnrollmentInteraction {
    const attempt = this.enrollments.get(route);
    if (attempt?.id !== id)
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Sign-in attempt expired or belongs to another supplying route.',
      );
    return attempt;
  }
  private current(route: string): AiSubscriptionHostStatus {
    const current = this.states.get(route);
    if (current === undefined)
      throw new SubscriptionProviderError('AUTH_INVALID', 'Subscription status is unavailable.');
    return current;
  }
  private async emit(status: AiSubscriptionHostStatus): Promise<AiSubscriptionHostStatus> {
    this.states.set(status.route_id, status);
    if (!this.stopped) await this.ports.publish(status);
    return status;
  }
  private track(task: Promise<void>): void {
    this.tasks.add(task);
    background(
      task.then(
        () => {
          this.tasks.delete(task);
        },
        (): void => {
          this.tasks.delete(task);
          this.log.warn('subscription.publication_failed', {
            reason: 'Subscription host lifecycle failed; refresh status before using its route.',
          });
        },
      ),
      'subscriptions.background_failed',
    );
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    for (const interaction of this.enrollments.values()) interaction.abort.abort();
    await Promise.allSettled(this.tasks);
    this.authorization.credentials.dispose();
  }
}
