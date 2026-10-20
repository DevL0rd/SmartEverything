import type { FlowNode, PortValue, TriggerNode, Wire } from '@smarteverything/domain';
import { portValueReferences } from '../check/references';
import type { Program } from '../program/walk';
import { change } from './util';
import { walkProgram } from '../program/walk';

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

export function referencesIn(value: PortValue): readonly Wire[] {
  return portValueReferences(value);
}

export function describeSlot(slot: SiteSlot): string {
  if (slot.kind === 'port') return `port "${slot.name}"`;
  return slot.label;
}

function portSites(owner: string, ports: Record<string, PortValue> | undefined): readonly Site[] {
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

function otherSite(
  owner: string | undefined,
  label: string,
  value: PortValue,
  assign: (value: PortValue) => void,
): Site {
  return { owner, slot: { kind: 'other', label }, value, assign, detach: undefined };
}

function rowSites(node: FlowNode): readonly Site[] {
  const owner = node.key;
  const branches = (node.branches ?? []).map((row) =>
    otherSite(owner, 'a branch condition', row.when, (next) => {
      change(row, { when: next });
    }),
  );
  const cases = (node.cases ?? []).flatMap((row) => {
    const { match } = row;
    if (!('when' in match)) return [];
    return [
      otherSite(owner, 'a case condition', match.when, (next) => {
        change(row, { match: { when: next } });
      }),
    ];
  });
  const outputs = (node.outputs ?? []).flatMap((output) =>
    Object.entries(output.values).map(([scope, value]) =>
      otherSite(owner, `the output "${output.name}"`, value, (next) => {
        Object.assign(output.values, { [scope]: next });
      }),
    ),
  );
  return [...branches, ...cases, ...outputs];
}

function triggerSites(trigger: TriggerNode): readonly Site[] {
  return portSites(trigger.key, trigger.ports);
}

function programSites(program: Program): readonly Site[] {
  const variables = program.variables.map((variable) =>
    otherSite(undefined, `the start value of "${variable.name}"`, variable.initial, (next) => {
      change(variable, { initial: next });
    }),
  );
  if (program.kind !== 'automation') return variables;
  const { admit } = program;
  const admitSite =
    admit === undefined
      ? []
      : [
          otherSite(undefined, 'the admit rule', admit, (next) => {
            change(program, { admit: next });
          }),
        ];
  return [...variables, ...admitSite, ...program.triggers.flatMap(triggerSites)];
}

export function sitesOf(program: Program): readonly Site[] {
  const nodes = walkProgram(program).flatMap(({ node }) => [
    ...portSites(node.key, node.ports),
    ...rowSites(node),
  ]);
  return [...programSites(program), ...nodes];
}

export function readersOf(
  program: Program,
  roots: ReadonlySet<string>,
): readonly { readonly site: Site; readonly reads: string }[] {
  return sitesOf(program).flatMap((site) => {
    const hit = referencesIn(site.value).find((reference) => roots.has(reference.from));
    return hit === undefined ? [] : [{ site, reads: hit.from }];
  });
}

export function renameRoot(
  value: PortValue,
  from: string,
  to: string,
): { readonly value: PortValue; readonly count: number } {
  if (!('wire' in value) || value.wire.from !== from) return { value, count: 0 };
  return { value: { wire: { from: to, port: value.wire.port } }, count: 1 };
}

export function countRoot(value: PortValue, root: string): number {
  return referencesIn(value).filter((reference) => reference.from === root).length;
}
