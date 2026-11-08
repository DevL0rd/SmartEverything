import type { ReactNode } from 'react';
import type {
  DescribeContext,
  FlowType,
  InputPort,
  WireScope,
  JsonValue,
  NodeRegistry,
  PortValue,
  ProgramV4,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import type { ProgramIndex } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { GraphIntent } from '../../host/apply-intents';
import type { FieldControl } from '../schema-fields';
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
  readonly heading?: ReactNode;
}

export type ValueSlot = (request: ValueRequest) => ReactNode;

export interface InspectorActions {
  readonly apply: (ops: readonly PatchOp[]) => void;
  readonly intent: (intent: GraphIntent) => void;
  readonly jump: (nodeId: string) => void;
  readonly gesture: (run: () => void) => void;
  readonly fix: (id: string) => void;
  readonly copyReference: (text: string) => void;
  readonly openHelp: (kindId: string) => void;
  readonly setFreePosition: (id: string, free: boolean) => void;
  readonly selectIteration: (index: number) => void;
  readonly editInterface: () => void;
  readonly deleteStep: (id: string) => void;
}

export interface FunctionChoice {
  readonly id: string;
  readonly name: string;
  readonly interfaceLine: string;
  readonly latest: number;
  readonly inputs: readonly InputPort[];
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

export interface GraphEnv {
  readonly graph: ProgramV4;
  readonly registry: NodeRegistry;
  readonly findings: readonly InspectorFinding[];
  readonly subjectChoices: ChoiceSubject | undefined;
  readonly renderValue: ValueSlot;
  readonly locked: boolean;
}

export interface InspectorEnv extends GraphEnv {
  readonly program: Program;
  readonly index: ProgramIndex;
  readonly describe: DescribeContext;
  readonly scope: WireScope;
  readonly functions: ReadonlyMap<string, FunctionChoice>;
  readonly exits: readonly string[];
  readonly breakpoint: boolean;
  readonly freePosition: boolean;
  readonly run: RunValues | null;
}

export interface SectionProps {
  readonly view: NodeView;
  readonly env: InspectorEnv;
  readonly actions: InspectorActions;
}
