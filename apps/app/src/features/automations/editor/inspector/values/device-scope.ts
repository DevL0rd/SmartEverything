import type { JsonValue, PortValue } from '@smarteverything/domain';
import type { DeviceScope } from './literal-model';
import { targetFormOf } from './target-model';

const SCOPING_PORTS = ['room', 'rooms', 'group'] as const;

function litOf(value: PortValue | undefined): JsonValue | undefined {
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

function idsOf(value: JsonValue | undefined): readonly string[] {
  if (typeof value === 'string') return value === '' ? [] : [value];
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function targetIdsOf(value: PortValue | undefined): readonly string[] {
  const lit = litOf(value);
  if (lit === undefined) return [];
  const form = targetFormOf(lit);
  if (form.t === 'devices') return form.ids;
  return form.id === '' ? [] : [form.id];
}

export function deviceScopeOf(
  inputNames: readonly string[],
  ports: Readonly<Record<string, PortValue>>,
): DeviceScope {
  if (inputNames.includes('target')) {
    return {
      target: targetIdsOf(ports['target']),
      wholeHome: litOf(ports['everyCamera']) === true,
    };
  }
  if (inputNames.includes('camera')) {
    return { target: idsOf(litOf(ports['camera'])), wholeHome: false };
  }
  if (inputNames.includes('tv')) {
    return { target: idsOf(litOf(ports['tv'])), wholeHome: false };
  }
  const scoping = SCOPING_PORTS.filter((name) => inputNames.includes(name));
  return {
    target: scoping.flatMap((name) => idsOf(litOf(ports[name]))),
    wholeHome: scoping.length > 0,
  };
}
