import { RetiredOperations } from './retired-operations';
import { RemoteHarnessModels } from './harness-model-remote';
import { admitSupplierInference } from '../harness/supplier-inference';
import { RemoteHarnessSubscriptions } from './harness-subscriptions';
import { Logger } from '@smarteverything/logging';
import { admitComputerRequest } from './harness-admission';
import { ApiError, HUB_HARNESS_CONTROL } from '@smarteverything/domain';
import type {
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
  HubHarnessControl,
  NodeHarnessFrame,
  AiModelRoute,
  HarnessDesiredConfiguration,
} from '@smarteverything/domain';
import type { HarnessService } from '../harness/service';

const OPERATION_TIMEOUT_MS = 120_000;
const UNBOUNDED_OPERATIONS: ReadonlySet<HarnessRuntimeRequest['kind']> = new Set([
  'open',
  'close',
  'compact',
]);
const MAX_RETIRED_OPERATIONS = 256;
const RECEIPT_STATES = {
  open: 'ready',
  prompt: 'accepted',
  steer: 'completed',
  note: 'completed',
  auxiliary: 'completed',
  interrupt: 'completed',
  compact: 'completed',
  command_list: 'completed',
  reference: 'completed',
  command: 'completed',
  answer: 'completed',
  close: 'closed',
  workspace: 'completed',
  permission: 'completed',
} as const satisfies Readonly<
  Record<HarnessRuntimeRequest['kind'], HarnessRuntimeReceipt['state']>
>;
interface Pending {
  readonly request: HarnessRuntimeRequest;
  readonly resolve: (receipt: HarnessRuntimeReceipt) => void;
  readonly reject: (cause: unknown) => void;
  readonly timer: NodeJS.Timeout | undefined;
}
export class RemoteHarness {
  private readonly pending = new Map<string, Pending>();
  private readonly retired = new RetiredOperations(MAX_RETIRED_OPERATIONS);
  private readonly sessions = new Map<string, number>();
  private stopped = false;
  readonly subscriptions: RemoteHarnessSubscriptions;
  readonly models: RemoteHarnessModels;
  private readonly unsubscribeModels: () => void;
  private readonly log = new Logger('hub.harness-configuration');
  constructor(
    private readonly service: HarnessService,
    readonly binding: {
      readonly device_id: string;
      readonly generation: string;
      readonly runtime_instance: string;
    },
    private readonly ports: {
      readonly send: (frame: HubHarnessControl) => void;
      readonly terminate: () => void;
      readonly authenticate: () => void;
      readonly admit?: (request: HarnessRuntimeRequest) => AiModelRoute | undefined;
    },
  ) {
    this.subscriptions = new RemoteHarnessSubscriptions(binding, ports);
    this.models = new RemoteHarnessModels(binding, {
      ...ports,
      admit: (request): void => {
        admitSupplierInference(service, binding, request);
      },
    });
    this.unsubscribeModels = service.routes.onChange(() => {
      this.models.revalidate();
    });
  }
  configure(configuration: HarnessDesiredConfiguration): void {
    if (this.stopped) return;
    try {
      this.ports.authenticate();
      this.ports.send(
        HUB_HARNESS_CONTROL.parse({
          ...this.binding,
          type: 'harness_configuration',
          configuration,
        }),
      );
    } catch (cause) {
      this.log.error('configuration.send_failed', cause, this.binding);
      this.ports.terminate();
      this.stop();
    }
  }
  hasSession(id: string, epoch: number): boolean {
    return !this.stopped && this.sessions.get(id) === epoch;
  }
  execute(id: string, request: HarnessRuntimeRequest): Promise<HarnessRuntimeReceipt> {
    if (this.stopped)
      throw new ApiError(
        'conflict',
        'Computer execution channel disconnected; effects may be unknown.',
      );
    this.ports.authenticate();
    const route = this.admit(request);
    if (this.pending.has(id))
      throw new ApiError('conflict', 'A computer operation with this identity is already pending.');
    return new Promise((resolve, reject) => {
      const timer = UNBOUNDED_OPERATIONS.has(request.kind)
        ? undefined
        : setTimeout(() => {
            this.expire(id);
          }, OPERATION_TIMEOUT_MS);
      timer?.unref();
      this.pending.set(id, { request, resolve, reject, timer });
      try {
        this.ports.send(
          HUB_HARNESS_CONTROL.parse({
            ...this.binding,
            type: 'harness_request',
            id,
            request,
            ...(route === undefined ? {} : { model_route: route }),
          }),
        );
      } catch (cause) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          cause instanceof Error
            ? cause
            : new ApiError('internal', 'Computer request send failed without an Error.'),
        );
      }
    });
  }
  private expire(id: string): void {
    const pending = this.pending.get(id);
    if (pending === undefined) return;
    this.pending.delete(id);
    this.retired.add(id);
    pending.reject(
      new ApiError(
        'conflict',
        `The computer did not answer the ${pending.request.kind} operation within ${String(OPERATION_TIMEOUT_MS / 1000)} seconds; its outcome is unknown.`,
      ),
    );
  }
  receive(frame: Extract<NodeHarnessFrame, { type: 'harness_reply' }>): void {
    if (this.retired.has(frame.id)) return;
    const pending = this.pending.get(frame.id);
    if (pending === undefined)
      throw new ApiError('forbidden', 'Computer reply names no pending operation.');
    this.ports.authenticate();
    if (frame.result.ok) {
      const receipt = frame.result.receipt;
      this.acceptReceipt(frame.id, pending.request, receipt);
      pending.resolve(receipt);
    } else pending.reject(new ApiError('conflict', frame.result.failure.message));
    clearTimeout(pending.timer);
    this.pending.delete(frame.id);
  }
  private acceptReceipt(
    id: string,
    request: HarnessRuntimeRequest,
    receipt: HarnessRuntimeReceipt,
  ): void {
    const session = request.kind === 'open' ? request.claim.session_id : request.session_id;
    const epoch = request.kind === 'open' ? request.claim.epoch : request.expected_epoch;
    if (
      receipt.operation_id !== id ||
      receipt.session_id !== session ||
      receipt.epoch !== epoch ||
      receipt.state !== RECEIPT_STATES[request.kind]
    )
      throw new ApiError(
        'forbidden',
        'Computer receipt does not match the admitted operation, session, epoch and state.',
      );
    if (request.kind === 'open') this.sessions.set(session, epoch);
    if (request.kind === 'close') this.sessions.delete(session);
  }
  private admit(request: HarnessRuntimeRequest): AiModelRoute | undefined {
    return this.ports.admit === undefined
      ? admitComputerRequest(this.service, this.binding, request)
      : this.ports.admit(request);
  }
  revalidate(): void {
    this.models.revalidate();
    const owned = new Map(this.sessions);
    for (const pending of this.pending.values()) {
      if (pending.request.kind === 'open')
        owned.set(pending.request.claim.session_id, pending.request.claim.epoch);
    }
    for (const [id, epoch] of owned) {
      try {
        this.service.storage.principal(id, this.binding);
      } catch (cause) {
        this.lose(id, epoch, cause);
      }
    }
  }
  private lose(id: string, epoch: number, cause: unknown): void {
    this.sessions.delete(id);
    const loss = HUB_HARNESS_CONTROL.options[2].parse({
      ...this.binding,
      type: 'harness_ownership_lost',
      session_id: id,
      epoch,
      failure: {
        code: 'ownership_lost',
        message: 'This conversation’s initiating profile or execution authority was revoked.',
        retry_at: null,
      },
    });
    try {
      this.ports.send(loss);
      this.service.directory.ownershipLost(loss);
    } finally {
      this.rejectSession(id, cause);
    }
  }
  private rejectSession(id: string, cause: unknown): void {
    for (const [operation, pending] of this.pending) {
      const session =
        pending.request.kind === 'open'
          ? pending.request.claim.session_id
          : pending.request.session_id;
      if (session !== id) continue;
      clearTimeout(pending.timer);
      this.retired.add(operation);
      this.pending.delete(operation);
      pending.reject(
        cause instanceof Error
          ? cause
          : new ApiError('forbidden', 'Computer conversation authority was revoked.'),
      );
    }
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.subscriptions.stop();
    this.models.stop();
    this.unsubscribeModels();
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(
        new ApiError(
          'conflict',
          'Computer execution channel lost; admitted effects may be unknown and were not replayed.',
        ),
      );
    }
    this.pending.clear();
    this.sessions.clear();
    this.service.directory.offline(
      { kind: 'device', device_id: this.binding.device_id },
      this.binding.generation,
      this.binding.runtime_instance,
    );
  }
}
