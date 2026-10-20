import type { FlowType } from '../automation-v3/types';
import type { PortValue } from '../automation-v3/port-value';
import type { JsonValue } from '../values';
import type { NodeCategoryId } from './categories';

export const NODE_CLASSES = ['trigger', 'pure', 'read', 'effect', 'control'] as const;
export type NodeClass = (typeof NODE_CLASSES)[number];

export const EFFECT_RETRY_CLASSES = ['idempotent', 'relative', 'external'] as const;
export type EffectRetryClass = (typeof EFFECT_RETRY_CLASSES)[number];

export const EFFECT_BUDGET_CLASSES = [
  'none',
  'command',
  'effects',
  'effects_person',
  'effects_if_durable',
] as const;
export type EffectBudgetClass = (typeof EFFECT_BUDGET_CLASSES)[number];

export const NODE_ACCESS = ['member', 'owner'] as const;
export type NodeAccess = (typeof NODE_ACCESS)[number];

export const NODE_TIERS = ['v1', 'v1.1', 'later'] as const;
export type NodeTier = (typeof NODE_TIERS)[number];

export const SHIPPED_TIERS: readonly NodeTier[] = ['v1', 'v1.1'];

export interface PortUi {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly options?: readonly { readonly id: string; readonly label: string }[];
  readonly optionsFrom?: string;
  readonly editor?: string;
}

export interface InputPortDecl {
  readonly name: string;
  readonly type: FlowType;
  readonly required: boolean;
  readonly default?: JsonValue;
  readonly static?: boolean;
  readonly live?: boolean;
  readonly description: string;
  readonly summary?: boolean;
  readonly ui?: PortUi;
}

export interface OutputPortDecl {
  readonly name: string;
  readonly type: FlowType;
  readonly optional?: boolean;
  readonly description: string;
}

export interface ScopeShape {
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly minimum?: number;
}

export interface EffectDecl {
  readonly retry: EffectRetryClass;
  readonly budget: EffectBudgetClass;
}

export type ReadKeys = (
  ports: Readonly<Record<string, PortValue | undefined>>,
) => readonly string[];

export interface NodeKind {
  readonly id: string;
  readonly name: string;
  readonly category: NodeCategoryId;
  readonly icon: string;
  readonly class: NodeClass;
  readonly description: string;
  readonly inputs: readonly InputPortDecl[];
  readonly outputs: readonly OutputPortDecl[];
  readonly exits: readonly string[];
  readonly scopes?: ScopeShape;
  readonly effect?: EffectDecl;
  readonly stateful?: boolean;
  readonly summary: string;
  readonly keywords: readonly string[];
  readonly reads?: ReadKeys;
  readonly access: NodeAccess;
  readonly tier: NodeTier;
}

export function defineNodeKind(kind: NodeKind): NodeKind {
  return kind;
}
