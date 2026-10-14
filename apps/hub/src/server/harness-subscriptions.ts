import { randomUUID } from 'node:crypto';
import { ApiError, HUB_HARNESS_CONTROL } from '@smarteverything/domain';
import type {
  AiSubscriptionHostStatus,
  HarnessSubscriptionRequest,
  HubHarnessControl,
  NodeHarnessFrame,
} from '@smarteverything/domain';

interface PendingSubscription {
  readonly request: HarnessSubscriptionRequest;
  readonly resolve: (status: AiSubscriptionHostStatus) => void;
  readonly reject: (cause: Error) => void;
  readonly timer: NodeJS.Timeout;
}
export class RemoteHarnessSubscriptions {
  private readonly retired = new Set<string>();
  private readonly pending = new Map<string, PendingSubscription>();
  constructor(
    private readonly binding: {
      readonly device_id: string;
      readonly generation: string;
      readonly runtime_instance: string;
    },
    private readonly ports: {
      readonly send: (frame: HubHarnessControl) => void;
      readonly authenticate: () => void;
    },
  ) {}
  control(request: HarnessSubscriptionRequest): Promise<AiSubscriptionHostStatus> {
    this.ports.authenticate();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.retired.add(id);
        reject(
          new ApiError(
            'conflict',
            'Subscription host did not answer. Refresh status before retrying sign-in.',
          ),
        );
      }, 45_000);
      timer.unref();
      this.pending.set(id, { request, resolve, reject, timer });
      try {
        this.ports.send(
          HUB_HARNESS_CONTROL.parse({
            ...this.binding,
            type: 'harness_subscription_control',
            id,
            request,
          }),
        );
      } catch (cause) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          cause instanceof Error
            ? cause
            : new ApiError('internal', 'Subscription control send failed without an Error.'),
        );
      }
    });
  }
  receive(
    frame: Extract<
      NodeHarnessFrame,
      { type: 'harness_subscription_status' | 'harness_subscription_failure' }
    >,
  ): void {
    if (frame.id === undefined || this.retired.has(frame.id)) return;
    const pending = this.pending.get(frame.id);
    if (pending === undefined)
      throw new ApiError('forbidden', 'Subscription reply has no pending control.');
    this.ports.authenticate();
    if (frame.type === 'harness_subscription_failure') {
      clearTimeout(pending.timer);
      this.pending.delete(frame.id);
      pending.reject(new ApiError('conflict', frame.failure.message));
      return;
    }
    const status = frame.status;
    if (
      status.profile_id !== pending.request.profile_id ||
      status.route_id !== pending.request.route_id ||
      status.provider !== pending.request.provider
    )
      throw new ApiError('forbidden', 'Subscription reply changed the admitted account route.');
    clearTimeout(pending.timer);
    this.pending.delete(frame.id);
    pending.resolve(status);
  }
  stop(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new ApiError('conflict', 'Subscription supplying host disconnected.'));
    }
    this.pending.clear();
  }
}
