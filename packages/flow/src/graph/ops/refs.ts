import type { GraphNode, PortValue, ProgramV4, TriggerNode, Wire } from '@smarteverything/domain';
import { portValueReferences } from '../../check/references';
import { triggersOf } from './identity';
import { refuse } from './result';
import { describeSlot, otherSite, portSites, type Site } from './sites';
import { change } from './util';

export { describeSlot, type Site };

export function referencesIn(value: PortValue): readonly Wire[] {
  return portValueReferences(value);
}

function rowSites(node: GraphNode): readonly Site[] {
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

function programSites(program: ProgramV4): readonly Site[] {
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
  return [...variables, ...admitSite, ...triggersOf(program).flatMap(triggerSites)];
}

export function sitesOf(program: ProgramV4): readonly Site[] {
  const nodes = program.nodes.flatMap((node) => [
    ...portSites(node.key, node.ports),
    ...rowSites(node),
  ]);
  return [...programSites(program), ...nodes];
}

export function readersOf(
  program: ProgramV4,
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

export function describeReader(site: Site, reads: string): string {
  return `"${reads}" is read by ${describeSlot(site.slot)} of ${site.owner === undefined ? 'the program' : `"${site.owner}"`}`;
}

export function guardFreeKeys(program: ProgramV4, keys: readonly string[]): void {
  const reader = readersOf(program, new Set(keys))[0];
  if (reader !== undefined) {
    refuse(
      'referenced',
      `${describeReader(reader.site, reader.reads)}, so a new node cannot take that key`,
    );
  }
}
