import { compileTriggerMatcher } from '../automation-nodes/triggers-device';
import type { JsonValue } from '../values';
import type { TriggerNode } from './node';
import type { PortValue } from './port-value';

export interface SignalView {
  readonly source: string;
  readonly kind: string;
  readonly subject?: string;
  readonly field?: string;
  readonly match?: Readonly<Record<string, JsonValue>>;
}

function literalPorts(
  ports: Readonly<Record<string, PortValue>>,
): Readonly<Record<string, JsonValue>> {
  const literals: Record<string, JsonValue> = {};
  for (const [name, port] of Object.entries(ports)) {
    if ('lit' in port) literals[name] = port.lit;
  }
  return literals;
}

export function signalViewOf(trigger: Pick<TriggerNode, 'kind' | 'ports'>): SignalView | undefined {
  const compiled = compileTriggerMatcher(trigger.kind, literalPorts(trigger.ports));
  if (!compiled.ok) return undefined;
  const { source, kind, subject, field, match } = compiled.matcher;
  return {
    source,
    kind,
    ...(subject === undefined ? {} : { subject }),
    ...(field === undefined ? {} : { field }),
    ...(match === undefined ? {} : { match }),
  };
}

export function signalViewsOf(
  triggers: readonly Pick<TriggerNode, 'id' | 'kind' | 'ports'>[],
): readonly { readonly triggerId: string; readonly view: SignalView }[] {
  return triggers.flatMap((trigger) => {
    const view = signalViewOf(trigger);
    return view === undefined ? [] : [{ triggerId: trigger.id, view }];
  });
}
