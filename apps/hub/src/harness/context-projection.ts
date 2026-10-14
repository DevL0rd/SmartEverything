import type {
  AiHarnessEvent,
  AiHarnessSession,
  AiModelRouteSelection,
} from '@smarteverything/domain';

type Context = AiHarnessSession['context'];
export function projectHarnessContext(
  event: Extract<AiHarnessEvent, { kind: 'state' }>,
  retained: Context,
): Context {
  const incoming = event.session.context;
  if (event.context_update === undefined) return retained ?? incoming;
  if (incoming === undefined || retained === undefined) return incoming;
  if (!sameContextModel(incoming, retained)) return incoming;
  if (event.context_update === 'measured') return incoming;
  if (event.context_update === 'restored')
    return retained.input_tokens === null ? incoming : retained;
  return {
    ...incoming,
    input_tokens: retained.input_tokens,
    state: changedContextState(incoming, retained),
  };
}
function sameContextModel(
  incoming: Pick<NonNullable<Context>, 'provider' | 'model' | 'capacity_tokens'>,
  retained: Pick<NonNullable<Context>, 'provider' | 'model' | 'capacity_tokens'>,
): boolean {
  return (
    incoming.provider === retained.provider &&
    incoming.model === retained.model &&
    incoming.capacity_tokens === retained.capacity_tokens
  );
}
function changedContextState(
  incoming: NonNullable<Context>,
  retained: NonNullable<Context>,
): NonNullable<Context>['state'] {
  if (incoming.state !== 'unmeasured') return incoming.state;
  return retained.state === 'compacting' ? 'measured' : retained.state;
}

export function compatibleHarnessContext(
  context: Context,
  selection: AiModelRouteSelection,
  capacity: number | null,
): Context {
  if (context === undefined) return undefined;
  return context.provider === selection.route_id &&
    context.model === selection.model &&
    (capacity === null || context.capacity_tokens === capacity)
    ? context
    : undefined;
}
export function projectContextRequest(
  event: Extract<AiHarnessEvent, { kind: 'state' }>,
  retained: AiHarnessSession['context_request'],
): AiHarnessSession['context_request'] {
  if (event.context_update !== 'changed' || retained === undefined) return retained;
  const incoming = event.session.context;
  if (incoming === undefined) return retained;
  if (incoming.state === 'compacting' || incoming.state === 'stale') return undefined;
  return sameContextModel(incoming, retained) ? retained : undefined;
}
