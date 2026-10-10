import { actionPhrase } from './action-phrases';
import type { HubTool } from './hub-tool';

const ID_KEYS: ReadonlySet<string> = new Set(['deviceId', 'deviceIds', 'cameraId', 'cameraIds']);
const NAMES_SHOWN = 3;

export interface ToolLineInput {
  readonly tool: HubTool;
  readonly args: Readonly<Record<string, unknown>>;
  readonly failed: boolean;
  readonly deviceName: (id: string) => string | null;
}

function idsIn(value: unknown, key: string | null, found: Set<string>): void {
  if (typeof value === 'string' && key !== null && ID_KEYS.has(key)) {
    found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      idsIn(entry, key, found);
    });
    return;
  }
  if (typeof value === 'object' && value !== null) {
    Object.entries(value).forEach(([child, entry]) => {
      idsIn(entry, child, found);
    });
  }
}

export function deviceIdsIn(args: Readonly<Record<string, unknown>>): string[] {
  const found = new Set<string>();
  idsIn(args, null, found);
  return [...found];
}

function devicesPhrase(labels: readonly string[]): string | null {
  if (labels.length === 0) {
    return null;
  }
  const shown = labels.slice(0, NAMES_SHOWN).map((label) => `the ${label}`);
  const more = labels.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${String(more)} more` : shown.join(' and ');
}

export function toolLine(input: ToolLineInput): string {
  const labels = deviceIdsIn(input.args)
    .map(input.deviceName)
    .filter((name): name is string => name !== null);
  const phrase = actionPhrase(input.tool, input.args, devicesPhrase(labels));
  const line = phrase ?? input.tool.title;
  return input.failed ? `Couldn’t do this: ${line}` : line;
}
