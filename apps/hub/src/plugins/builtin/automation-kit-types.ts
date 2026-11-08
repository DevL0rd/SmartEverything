import {
  pluginEntityType,
  type FlowType,
  type JsonValue,
  type PluginInputPort,
  type PluginNode,
  type RefKind,
} from '@smarteverything/domain';
import type { z } from 'zod';

export interface PortKind<V> {
  readonly type: FlowType;
  readonly value?: () => V;
}

export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
}

export interface NumberRange {
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
}

export const ports = {
  text: (): PortKind<string> => ({ type: { t: 'text' } }),
  boolean: (): PortKind<boolean> => ({ type: { t: 'boolean' } }),
  duration: (): PortKind<number> => ({ type: { t: 'duration' } }),
  number: (range: NumberRange = {}): PortKind<number> => ({ type: { t: 'number', ...range } }),
  choice: <const O extends readonly ChoiceOption[]>(options: O): PortKind<O[number]['id']> => ({
    type: { t: 'choice', options: [...options] },
  }),
  ref: (of: RefKind): PortKind<string> => ({ type: { t: 'ref', of } }),
  entity: (pluginId: string, entityId: string): PortKind<string> => ({
    type: pluginEntityType(pluginId, entityId),
  }),
  list: <V>(of: PortKind<V>): PortKind<V[]> => ({ type: { t: 'list', of: of.type } }),
};

export interface InputMeta {
  readonly title: string;
  readonly description: string;
  readonly default?: JsonValue;
  readonly ui?: PluginInputPort['ui'];
}

export interface InputDecl<V> extends PortKind<V>, InputMeta {
  readonly required: boolean;
}

export function input<V>(kind: PortKind<V>, meta: InputMeta): InputDecl<V> {
  return { ...meta, type: kind.type, required: true };
}

export function optionalInput<V>(kind: PortKind<V>, meta: InputMeta): InputDecl<V | undefined> {
  return { ...meta, type: kind.type, required: false };
}

export type Pointer = '' | `/${string}`;

export interface OutputDecl {
  readonly type: FlowType;
  readonly title: string;
  readonly description: string;
  readonly from: Pointer;
  readonly optional?: boolean;
}

export function output(kind: PortKind<unknown>, meta: Omit<OutputDecl, 'type'>): OutputDecl {
  return { ...meta, type: kind.type };
}

export interface EventDecl {
  readonly kind: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export type FieldOf<E extends EventDecl> = keyof E['fields'] & string;

export type InputDecls = Readonly<Record<string, InputDecl<unknown>>>;

export type OutputDecls = Readonly<Record<string, OutputDecl>>;

export type NoDecls = Readonly<Record<never, never>>;

export type ToolArgs = Readonly<Record<string, unknown>>;

export interface ToolRef<I> {
  readonly name: string;
  readonly input: z.ZodType<I>;
}

export type PortValues<In extends InputDecls> = {
  readonly [K in keyof In]: In[K] extends PortKind<infer V> ? V : never;
};

export type PortsFor<T, V> = {
  [K in keyof V]: [V[K]] extends [T] ? K : never;
}[keyof V];

export type RecordArg<T, V> = T extends readonly unknown[]
  ? never
  : T extends Readonly<Record<string, unknown>>
    ? { readonly record: ArgsOf<T, V> }
    : never;

export type ArgFor<T, V> =
  | { readonly port: PortsFor<T, V> }
  | (T extends JsonValue ? { readonly lit: T } : never)
  | RecordArg<T, V>;

export type ArgsOf<I, V> = {
  readonly [K in keyof I]: ArgFor<I[K], V>;
};

export type NodeFields = Pick<PluginNode, 'access' | 'retry' | 'budget' | 'errors' | 'timeout'>;

export interface UntilSpec<E extends EventDecl, In extends InputDecls, Out extends OutputDecls> {
  readonly event: E;
  readonly match: Readonly<
    Partial<
      Record<
        FieldOf<E>,
        { readonly output: keyof Out & string } | { readonly port: keyof In & string }
      >
    >
  >;
  readonly timeout: number | { readonly port: keyof In & string };
}

export interface NodeBase<
  I extends ToolArgs,
  In extends InputDecls,
  Out extends OutputDecls,
  E extends EventDecl,
> extends Partial<NodeFields> {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly summary: string;
  readonly keywords?: readonly string[];
  readonly tool: ToolRef<I>;
  readonly inputs: In;
  readonly outputs?: Out;
  readonly args: NoInfer<ArgsOf<I, PortValues<In>>>;
  readonly until?: UntilSpec<E, In, Out>;
  readonly batch?: { readonly arg: keyof I & string };
  readonly waitOnly?: readonly (keyof Out & string)[];
}

export interface ActionSpec<
  I extends ToolArgs,
  In extends InputDecls,
  Out extends OutputDecls,
  E extends EventDecl,
> extends NodeBase<I, In, Out, E> {
  readonly mode?: PluginNode['mode'];
}

export type QuerySpec<
  I extends ToolArgs,
  In extends InputDecls,
  Out extends OutputDecls,
  E extends EventDecl,
> = NodeBase<I, In, Out, E>;
