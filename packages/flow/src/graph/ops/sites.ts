import type { PortValue } from '@smarteverything/domain';

export type SiteSlot =
  | { readonly kind: 'port'; readonly name: string }
  | { readonly kind: 'other'; readonly label: string };

export interface Site {
  readonly owner: string | undefined;
  readonly slot: SiteSlot;
  readonly value: PortValue;
  readonly assign: (value: PortValue) => void;
  readonly detach: (() => void) | undefined;
}

export function describeSlot(slot: SiteSlot): string {
  if (slot.kind === 'port') return `port "${slot.name}"`;
  return slot.label;
}

export function portSites(
  owner: string,
  ports: Record<string, PortValue> | undefined,
): readonly Site[] {
  const table = ports ?? {};
  return Object.entries(table).map(([name, value]): Site => ({
    owner,
    slot: { kind: 'port', name },
    value,
    assign: (next): void => {
      Object.assign(table, { [name]: next });
    },
    detach: (): void => {
      Reflect.deleteProperty(table, name);
    },
  }));
}

export function otherSite(
  owner: string | undefined,
  label: string,
  value: PortValue,
  assign: (value: PortValue) => void,
): Site {
  return { owner, slot: { kind: 'other', label }, value, assign, detach: undefined };
}
