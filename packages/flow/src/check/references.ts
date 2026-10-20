import type { FlowNode, PortValue, TriggerNode, Wire } from '@smarteverything/domain';
import type { Entry } from '../program/lookup';
import type { Program } from '../program/walk';

export type ReferenceSite =
  | { readonly kind: 'port'; readonly port: string }
  | { readonly kind: 'branch'; readonly id: string }
  | { readonly kind: 'case'; readonly id: string }
  | { readonly kind: 'output'; readonly name: string; readonly scope: string }
  | { readonly kind: 'admit' }
  | { readonly kind: 'variable'; readonly name: string };

export interface PortReference extends Wire {
  readonly site: ReferenceSite;
}

interface Site {
  readonly site: ReferenceSite;
  readonly value: PortValue;
}

export function wireOf(value: PortValue): Wire | undefined {
  return 'wire' in value ? value.wire : undefined;
}

export function portValueReferences(value: PortValue): readonly Wire[] {
  const found = wireOf(value);
  return found === undefined ? [] : [found];
}

function switchWhen(node: FlowNode): readonly Site[] {
  return (node.cases ?? []).flatMap((row) =>
    'when' in row.match ? [{ site: { kind: 'case', id: row.id }, value: row.match.when }] : [],
  );
}

function nodeSites(node: FlowNode): readonly Site[] {
  return [
    ...Object.entries(node.ports ?? {}).map(([port, value]): Site => ({
      site: { kind: 'port', port },
      value,
    })),
    ...(node.branches ?? []).map((row): Site => ({
      site: { kind: 'branch', id: row.id },
      value: row.when,
    })),
    ...switchWhen(node),
    ...(node.outputs ?? []).flatMap((output) =>
      Object.entries(output.values).map(([scope, value]): Site => ({
        site: { kind: 'output', name: output.name, scope },
        value,
      })),
    ),
  ];
}

function triggerSites(trigger: TriggerNode): readonly Site[] {
  return Object.entries(trigger.ports).map(([port, value]): Site => ({
    site: { kind: 'port', port },
    value,
  }));
}

function programSites(program: Program): readonly Site[] {
  return [
    ...('admit' in program && program.admit !== undefined
      ? [{ site: { kind: 'admit' }, value: program.admit } satisfies Site]
      : []),
    ...program.variables.map((variable): Site => ({
      site: { kind: 'variable', name: variable.name },
      value: variable.initial,
    })),
  ];
}

function referencesOfSites(sites: readonly Site[]): readonly PortReference[] {
  return sites.flatMap(({ site, value }) =>
    portValueReferences(value).map((wire) => ({ ...wire, site })),
  );
}

export function entryReferences(entry: Entry): readonly PortReference[] {
  return referencesOfSites(
    entry.kind === 'trigger' ? triggerSites(entry.node) : nodeSites(entry.node),
  );
}

export function programLevelReferences(program: Program): readonly PortReference[] {
  return referencesOfSites(programSites(program));
}

export function referencedKeys(references: readonly Wire[]): ReadonlySet<string> {
  return new Set(references.map((reference) => reference.from));
}
