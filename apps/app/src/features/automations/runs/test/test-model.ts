import {
  outputLabel,
  type AutomationRunWouldSend,
  type JsonValue,
  type OutputPort,
  type RunNodeRecord,
} from '@smarteverything/domain';
import { controlOf, type FieldControl } from '../../editor/inspector/schema-fields';
import { defaultLiteral } from '../../editor/inspector/values/literal-model';
import type { RunStartBody } from '../../data/api';

export type JsonRecord = Readonly<Record<string, JsonValue>>;

export type StartWith = 'last' | 'form';

export interface LastEvent {
  readonly label: string;
  readonly values: JsonRecord;
}

export interface PayloadField {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly required: boolean;
  readonly control: FieldControl;
}

export function payloadFieldsOf(ports: readonly OutputPort[]): readonly PayloadField[] {
  return ports.map((port) => ({
    name: port.name,
    label: port.label ?? outputLabel(port.name),
    description: port.description ?? '',
    required: port.optional !== true,
    control: controlOf(port.type),
  }));
}

export function initialPayload(fields: readonly PayloadField[]): JsonRecord {
  return Object.fromEntries(fields.map((field) => [field.name, defaultLiteral(field.control)]));
}

export function missingFields(
  fields: readonly PayloadField[],
  values: JsonRecord,
): readonly string[] {
  return fields
    .filter((field) => field.required && (values[field.name] ?? null) === null)
    .map((field) => field.label);
}

export function initialStartWith(last: LastEvent | null): StartWith {
  return last === null ? 'form' : 'last';
}

export interface StartWithOption {
  readonly value: StartWith;
  readonly title: string;
  readonly subtitle: string;
  readonly disabled: boolean;
}

export function startWithOptions(last: LastEvent | null): readonly StartWithOption[] {
  return [
    {
      value: 'last',
      title: 'Last real event',
      subtitle: last === null ? 'Nothing has triggered this yet.' : last.label,
      disabled: last === null,
    },
    {
      value: 'form',
      title: 'Values I type',
      subtitle: 'Fill in what the trigger would give.',
      disabled: false,
    },
  ];
}

export type PretendRow =
  | {
      readonly id: string;
      readonly kind: 'device';
      readonly device: string;
      readonly control: string;
      readonly value: JsonValue;
    }
  | {
      readonly id: string;
      readonly kind: 'variable';
      readonly automationId: string;
      readonly name: string;
      readonly value: JsonValue;
    };

export function pretendReady(row: PretendRow): boolean {
  return row.kind === 'device'
    ? row.device.trim() !== '' && row.control.trim() !== ''
    : row.automationId.trim() !== '' && row.name.trim() !== '';
}

export function overridesOf(rows: readonly PretendRow[]): JsonRecord | undefined {
  const devices: JsonValue[] = [];
  const variables: JsonValue[] = [];
  for (const row of rows.filter(pretendReady)) {
    if (row.kind === 'device') {
      devices.push({ device: row.device, control: row.control, value: row.value });
    } else {
      variables.push({ automationId: row.automationId, name: row.name, value: row.value });
    }
  }
  if (devices.length === 0 && variables.length === 0) return undefined;
  return { devices, variables };
}

export interface TestDraft {
  readonly startWith: StartWith;
  readonly last: LastEvent | null;
  readonly values: JsonRecord;
  readonly rows: readonly PretendRow[];
}

function inputsOf(draft: TestDraft): JsonRecord {
  return draft.startWith === 'last' && draft.last !== null ? draft.last.values : draft.values;
}

export function testRequest(
  automationId: string,
  draft: TestDraft,
  breakpoints: readonly string[],
): RunStartBody {
  const overrides = overridesOf(draft.rows);
  return {
    automationId,
    mode: 'dry',
    inputs: inputsOf(draft),
    ...(overrides === undefined ? {} : { overrides }),
    breakpoints: [...breakpoints],
  };
}

export function realRequest(automationId: string, draft: TestDraft): RunStartBody {
  return { automationId, mode: 'live', inputs: inputsOf(draft) };
}

export const TEST_BANNER = {
  title: 'A test sends nothing to your devices.',
  body: 'It shows what would have happened.',
} as const;

export const REAL_RUN_WARNING = 'This really controls your devices.';

export function valueText(value: JsonValue): string {
  if (typeof value === 'string') return value === '' ? 'empty text' : value;
  if (value === null) return 'nothing';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'number') return String(value);
  return Array.isArray(value)
    ? `${String(value.length)} ${value.length === 1 ? 'item' : 'items'}`
    : `${String(Object.keys(value).length)} fields`;
}

const OUTCOME_WORD: Readonly<Record<AutomationRunWouldSend['outcome'], string>> = {
  ok: 'Would work',
  fail: 'Would fail',
  offline: 'Would be offline',
  unknown: 'Would be unconfirmed',
  slow: 'Would be slow',
};

export interface WouldSendRow {
  readonly key: string;
  readonly nodeId: string;
  readonly title: string;
  readonly target: string;
  readonly value: string;
  readonly outcome: string;
  readonly problem: boolean;
}

function paramsText(params: JsonRecord): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return 'No value';
  return entries.map(([name, value]) => `${outputLabel(name)} ${valueText(value)}`).join(', ');
}

export function wouldSendRows(
  commands: readonly AutomationRunWouldSend[],
  titles: ReadonlyMap<string, string>,
): readonly WouldSendRow[] {
  return commands.map((command, index) => ({
    key: `${command.at}:${command.path}:${String(index)}`,
    nodeId: command.node,
    title: titles.get(command.node) ?? command.kind,
    target: command.targets.length === 0 ? 'No target' : command.targets.join(', '),
    value: paramsText(command.params),
    outcome: OUTCOME_WORD[command.outcome],
    problem: command.outcome !== 'ok',
  }));
}

export type DebugAction = 'continue' | 'over' | 'into' | 'out' | 'stop';

export interface DebugState {
  readonly paused: boolean;
  readonly onInstance: boolean;
  readonly busy: boolean;
}

export interface DebugControl {
  readonly action: DebugAction;
  readonly label: string;
  readonly icon: 'play' | 'skipForward' | 'arrowDown' | 'arrowUp' | 'square';
  readonly shortcut: string | null;
  readonly enabled: boolean;
}

export function debugControls(state: DebugState): readonly DebugControl[] {
  const stepping = state.paused && !state.busy;
  return [
    { action: 'continue', label: 'Continue', icon: 'play', shortcut: 'F8', enabled: stepping },
    { action: 'over', label: 'Step over', icon: 'skipForward', shortcut: 'F10', enabled: stepping },
    {
      action: 'into',
      label: 'Step into',
      icon: 'arrowDown',
      shortcut: 'F11',
      enabled: stepping && state.onInstance,
    },
    { action: 'out', label: 'Step out', icon: 'arrowUp', shortcut: 'Shift+F11', enabled: stepping },
    { action: 'stop', label: 'Stop', icon: 'square', shortcut: null, enabled: !state.busy },
  ];
}

export function debugActionForKey(
  key: string,
  shift: boolean,
  state: DebugState,
): DebugAction | null {
  const wanted: DebugAction | null =
    key === 'F8'
      ? 'continue'
      : key === 'F10'
        ? 'over'
        : key === 'F11'
          ? shift
            ? 'out'
            : 'into'
          : null;
  if (wanted === null) return null;
  return debugControls(state).find((control) => control.action === wanted)?.enabled === true
    ? wanted
    : null;
}

export interface PauseSummary {
  readonly nodeId: string;
  readonly title: string;
}

export function pauseOf(
  paused: readonly { readonly nodeId: string }[],
  titles: ReadonlyMap<string, string>,
): PauseSummary | null {
  const first = paused[0];
  return first === undefined
    ? null
    : { nodeId: first.nodeId, title: titles.get(first.nodeId) ?? first.nodeId };
}

export const PAUSED_CHIP = 'Paused';

export interface VariableSection {
  readonly id: 'step' | 'run' | 'persistent' | 'trigger';
  readonly title: string;
  readonly value: JsonValue;
}

function recordOf(entries: readonly (readonly [string, JsonValue])[]): JsonRecord {
  return Object.fromEntries(entries);
}

export function variableSections(input: {
  readonly nodes: readonly RunNodeRecord[];
  readonly paused: string | null;
  readonly titles: ReadonlyMap<string, string>;
  readonly trigger: JsonRecord;
  readonly rows: readonly PretendRow[];
}): readonly VariableSection[] {
  const { nodes, paused, titles, trigger, rows } = input;
  const current = nodes.findLast((node) => node.node_id === paused);
  const produced = nodes.flatMap((node): [string, JsonValue][] =>
    node.output_preview === null
      ? []
      : [[titles.get(node.node_id) ?? node.node_id, node.output_preview]],
  );
  const persistent = rows.flatMap((row): [string, JsonValue][] =>
    row.kind === 'variable' && pretendReady(row) ? [[row.name, row.value]] : [],
  );
  return [
    { id: 'step', title: 'This step gets', value: current?.input_preview ?? {} },
    { id: 'run', title: 'Values so far', value: recordOf(produced) },
    { id: 'persistent', title: 'Remembered values', value: recordOf(persistent) },
    { id: 'trigger', title: 'What the trigger gave', value: trigger },
  ];
}

export interface TreeRow {
  readonly key: string;
  readonly depth: number;
  readonly name: string;
  readonly preview: string;
  readonly open: boolean | null;
}

function childrenOf(value: JsonValue): readonly (readonly [string, JsonValue])[] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index + 1), item]);
  return typeof value === 'object' && value !== null ? Object.entries(value) : [];
}

export function treeRows(value: JsonValue, expanded: ReadonlySet<string>): readonly TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: JsonValue, path: string, depth: number): void => {
    for (const [name, child] of childrenOf(node)) {
      const key = `${path}/${name}`;
      const expandable = childrenOf(child).length > 0;
      const open = expandable ? expanded.has(key) : null;
      rows.push({ key, depth, name, preview: valueText(child), open });
      if (open === true) walk(child, key, depth + 1);
    }
  };
  walk(value, '', 0);
  return rows;
}
