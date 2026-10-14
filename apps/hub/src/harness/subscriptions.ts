import { createHash } from 'node:crypto';
import { ApiError, AI_SUBSCRIPTION_HOST_STATUS } from '@smarteverything/domain';
import type {
  AiSubscriptionHostStatus,
  AiSubscriptionProvider,
  AiHarnessTarget,
  HarnessSubscriptionRequest,
  NodeHarnessFrame,
} from '@smarteverything/domain';
import type { HarnessConnection, HarnessDirectory } from './directory';
import type { HarnessRoutes } from './routes';

export class HarnessSubscriptions {
  private readonly statuses = new Map<string, AiSubscriptionHostStatus>();
  constructor(
    private readonly directory: HarnessDirectory,
    private readonly routes: HarnessRoutes,
  ) {
    directory.onRegister((connection) => {
      routes.offline(connection.host.target);
    });
    directory.onOffline((host) => {
      routes.offline(host.target);
      for (const [id, status] of this.statuses)
        if (sameTarget(status.route.supplier, host.target)) this.statuses.delete(id);
    });
  }
  async control(
    profileId: string,
    input: {
      readonly target: AiHarnessTarget;
      readonly provider: AiSubscriptionProvider;
      readonly command: HarnessSubscriptionRequest['command'];
    },
  ): Promise<AiSubscriptionHostStatus> {
    const connection = this.directory.get(input.target);
    this.admitSupplier(connection);
    if (connection.host.target.kind === 'server')
      throw new ApiError(
        'forbidden',
        'Subscription enrollment currently requires its supplying Linux/macOS computer. Hub OS access remains unavailable.',
      );
    if (connection.subscription === undefined)
      throw new ApiError(
        'conflict',
        'This computer has not negotiated subscription enrollment. Update or reconnect its background runtime.',
      );
    const routeId = subscriptionRouteId(profileId, input.target, input.provider);
    const request = {
      profile_id: profileId,
      route_id: routeId,
      provider: input.provider,
      command: input.command,
    };
    const status = await connection.subscription(request);
    this.acceptReply(status, request, input.target);
    return status;
  }
  frame(frame: Extract<NodeHarnessFrame, { type: 'harness_subscription_status' }>): void {
    const connection = this.directory.bound(
      frame.device_id,
      frame.generation,
      frame.runtime_instance,
    );
    this.admitSupplier(connection);
    this.accept(frame.status, { kind: 'device', device_id: frame.device_id });
  }
  private acceptReply(
    status: AiSubscriptionHostStatus,
    request: HarnessSubscriptionRequest,
    target: AiHarnessTarget,
  ): void {
    if (
      status.profile_id !== request.profile_id ||
      status.route_id !== request.route_id ||
      status.provider !== request.provider
    )
      throw new ApiError(
        'forbidden',
        'Subscription response changed its authorized initiating profile or selected account route.',
      );
    this.accept(status, target);
  }
  private admitSupplier(connection: HarnessConnection): void {
    if (
      connection.actor.kind !== 'node' ||
      connection.host.target.kind !== 'device' ||
      (connection.host.platform !== 'linux' && connection.host.platform !== 'macos') ||
      connection.subscription === undefined
    )
      throw new ApiError(
        'forbidden',
        'Only a negotiated Linux/macOS computer supplier may publish subscription accounts. Phone/client publication is not authorized.',
      );
  }
  private accept(raw: AiSubscriptionHostStatus, target: AiHarnessTarget): void {
    const status = AI_SUBSCRIPTION_HOST_STATUS.parse(raw);
    if (
      !sameTarget(status.route.supplier, target) ||
      status.route_id !== subscriptionRouteId(status.profile_id, target, status.provider) ||
      status.route.id !== status.route_id ||
      status.route.profile_id !== status.profile_id ||
      status.route.subscriber_id !== status.profile_id ||
      status.route.billing !== 'subscription-only' ||
      status.route.auth.kind !== authKind(status.provider)
    )
      throw new ApiError(
        'forbidden',
        'Subscription advertisement differs from its supplying host, initiating profile or explicit authorization path.',
      );
    this.statuses.set(status.route_id, status);
    this.routes.publish(status.route);
  }
}
export function subscriptionRouteId(
  profileId: string,
  target: AiHarnessTarget,
  provider: AiSubscriptionProvider,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ profileId, target, provider }))
    .digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
function sameTarget(left: AiHarnessTarget, right: AiHarnessTarget): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function authKind(provider: AiSubscriptionProvider): string {
  return provider === 'claude'
    ? 'claude-subscription-oauth'
    : provider === 'chatgpt-codex'
      ? 'chatgpt-codex-oauth'
      : 'chatgpt-sign-in';
}
