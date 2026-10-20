import type {
  AutomationFunctionDetail,
  AutomationFunctionUser,
  FunctionV3,
  InputPort,
  OutputPort,
} from '@smarteverything/domain';
import { walkProgram } from '@smarteverything/flow/program/walk';
import type { FunctionCreateBody } from '../../data/api';
import { typeText } from '../make-reusable/plain-reference';
import { kindLabel, placesText } from '../library/library-model';
import { FUNCTION_NAME } from '../edit/new-node-model';

export interface PortLine {
  readonly name: string;
  readonly title: string;
  readonly typeText: string;
  readonly requirement: string;
  readonly description: string | null;
}

export interface ExitLine {
  readonly name: string;
}

export interface InterfaceCardModel {
  readonly inputs: readonly PortLine[];
  readonly outputs: readonly PortLine[];
  readonly exits: readonly ExitLine[];
}

export type Ownership = 'builtin' | 'mine' | 'shared';

export interface HeroModel {
  readonly name: string;
  readonly kindLabel: string;
  readonly versionLabel: string;
  readonly ownership: Ownership;
  readonly ownershipLabel: string;
  readonly description: string | null;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly deleteRefusal: string | null;
}

export interface BodyLine {
  readonly key: string;
  readonly depth: number;
  readonly text: string;
}

export interface UsedByGroups {
  readonly automations: readonly AutomationFunctionUser[];
  readonly nodes: readonly AutomationFunctionUser[];
  readonly summary: string;
}

const OWNERSHIP_LABEL: Readonly<Record<Ownership, string>> = {
  builtin: 'Built in',
  mine: 'You made it',
  shared: 'Made by someone else',
};

function defaultText(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  return JSON.stringify(value);
}

function inputLine(port: InputPort): PortLine {
  const requirement =
    port.default !== undefined
      ? `Default ${defaultText(port.default)}`
      : port.required
        ? 'Required'
        : 'Optional';
  return {
    name: port.name,
    title: port.label ?? port.name,
    typeText: typeText(port.type),
    requirement,
    description: port.description ?? null,
  };
}

function outputLine(port: OutputPort): PortLine {
  return {
    name: port.name,
    title: port.label ?? port.name,
    typeText: typeText(port.type),
    requirement: port.optional === true ? 'Only sometimes' : 'Always given',
    description: port.description ?? null,
  };
}

export interface InterfaceSpec {
  readonly inputs: readonly InputPort[];
  readonly outputs: readonly OutputPort[];
  readonly exits: readonly string[];
}

export function interfaceCard(spec: InterfaceSpec): InterfaceCardModel {
  return {
    inputs: spec.inputs.map(inputLine),
    outputs: spec.outputs.map(outputLine),
    exits: spec.exits.map((name) => ({ name })),
  };
}

export function exitLine(name: string): PortLine {
  return { name, title: name, typeText: '', requirement: '', description: null };
}

export function ownershipOf(detail: AutomationFunctionDetail, userId: string | null): Ownership {
  if (detail.builtin) return 'builtin';
  return userId !== null && detail.createdBy === userId ? 'mine' : 'shared';
}

export function deleteRefusal(detail: AutomationFunctionDetail): string | null {
  if (detail.builtin) return 'Built-in Custom Nodes cannot be deleted.';
  if (detail.usedBy.length === 0) return null;
  return `It is used in ${placesText(detail.usedBy.length)}. Remove it from them first.`;
}

export function heroModel(detail: AutomationFunctionDetail, userId: string | null): HeroModel {
  const ownership = ownershipOf(detail, userId);
  const refusal = deleteRefusal(detail);
  return {
    name: detail.name,
    kindLabel: kindLabel(detail.interface.flavour),
    versionLabel: `Version ${String(detail.revision)}`,
    ownership,
    ownershipLabel: OWNERSHIP_LABEL[ownership],
    description: detail.description,
    canEdit: detail.editable && !detail.builtin,
    canDelete: !detail.builtin && detail.editable,
    deleteRefusal: refusal,
  };
}

export function usedByGroups(detail: AutomationFunctionDetail): UsedByGroups {
  const automations = detail.usedBy.filter((user) => user.kind === 'automation');
  const nodes = detail.usedBy.filter((user) => user.kind === 'function');
  const parts = [
    automations.length === 0
      ? null
      : `${String(automations.length)} ${automations.length === 1 ? 'automation' : 'automations'}`,
    nodes.length === 0
      ? null
      : `${String(nodes.length)} ${nodes.length === 1 ? 'Custom Node' : 'Custom Nodes'}`,
  ].filter((part): part is string => part !== null);
  return { automations, nodes, summary: parts.length === 0 ? 'Not used yet' : parts.join(' and ') };
}

export function bodyLines(program: FunctionV3): readonly BodyLine[] {
  return walkProgram(program).map(({ node, ancestors }) => ({
    key: node.key,
    depth: ancestors.length,
    text: node.label ?? node.key,
  }));
}

export function copyRequest(detail: AutomationFunctionDetail): FunctionCreateBody {
  const named = `${detail.name} copy`;
  return {
    name: FUNCTION_NAME.safeParse(named).success ? named : detail.name,
    definition: detail.program,
    layout: detail.layout,
  };
}
