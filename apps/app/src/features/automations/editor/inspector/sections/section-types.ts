import type { ReactNode } from 'react';
import type {
  DescribeContext,
  FlowType,
  WireScope,
  JsonValue,
  NodeRegistry,
  PortValue,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import type { ProgramIndex } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { FieldControl } from '../schema-fields';
import type { RowEdit } from './rows-model';
import type { NodeView } from './node-view';

export interface InspectorFinding {
  readonly id: string;
  readonly severity: 'error' | 'warning' | 'hint';
  readonly message: string;
  readonly port: string | undefined;
  readonly fix: string | undefined;
}

export interface ValueRequest {
  readonly nodeKey: string;
  readonly slot: string;
  readonly label: string;
  readonly helper: string | undefined;
  readonly type: FlowType | undefined;
  readonly control: FieldControl | undefined;
  readonly isStatic: boolean;
  readonly required: boolean;
  readonly value: PortValue | undefined;
  readonly message: string | undefined;
  readonly onChange: (value: PortValue | null) => void;
}

export type ValueSlot = (request: ValueRequest) => ReactNode;

export interface InspectorActions {
  readonly apply: (ops: readonly PatchOp[]) => void;
  readonly editRows: (key: string, edits: readonly RowEdit[]) => void;
  readonly gesture: (run: () => void) => void;
  readonly fix: (id: string) => void;
  readonly copyReference: (text: string) => void;
  readonly openHelp: (kindId: string) => void;
  readonly setFreePosition: (id: string, free: boolean) => void;
  readonly selectIteration: (index: number) => void;
  readonly editInterface: () => void;
}

export interface FunctionChoice {
  readonly id: string;
  readonly name: string;
  readonly interfaceLine: string;
  readonly latest: number;
}

export interface RunValues {
  readonly iterations: number;
  readonly iteration: number;
  readonly inputs: JsonValue;
  readonly outputs: JsonValue;
  readonly memory: JsonValue | undefined;
}

export interface ChoiceSubject {
  readonly options: readonly { readonly id: string; readonly label: string }[];
}

export interface InspectorEnv {
  readonly program: Program;
  readonly index: ProgramIndex;
  readonly registry: NodeRegistry;
  readonly describe: DescribeContext;
  readonly scope: WireScope;
  readonly findings: readonly InspectorFinding[];
  readonly functions: ReadonlyMap<string, FunctionChoice>;
  readonly exits: readonly string[];
  readonly breakpoint: boolean;
  readonly freePosition: boolean;
  readonly run: RunValues | null;
  readonly subjectChoices: ChoiceSubject | undefined;
  readonly renderValue: ValueSlot;
  readonly locked: boolean;
}

export interface SectionProps {
  readonly view: NodeView;
  readonly env: InspectorEnv;
  readonly actions: InspectorActions;
}
