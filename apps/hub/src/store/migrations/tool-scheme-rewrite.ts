import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { DROPPED_TOOLS, type StoredCall } from './tool-scheme-calls';

export type CallConversion = (call: StoredCall) => StoredCall | null;

type Json = Readonly<Record<string, JsonValue>>;

export class ToolCallLeftError extends Error {
  override readonly name = 'ToolCallLeftError';

  constructor(readonly places: readonly string[]) {
    super(
      `These stored tool calls name a tool that no longer exists and cannot be moved to the current tools: ${places.join('; ')}. Change them in the app first, then start the hub again.`,
    );
  }
}

interface Rewrite {
  readonly value: JsonValue;
  readonly calls: number;
  readonly left: readonly string[];
}

function isJson(value: JsonValue): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function literal(port: JsonValue | undefined): JsonValue | undefined {
  return port !== undefined && isJson(port) ? port['lit'] : undefined;
}

function argsOf(value: JsonValue | undefined): Json {
  return value !== undefined && isJson(value) ? value : {};
}

function scheduledCall(node: Json, convert: CallConversion): Rewrite | null {
  const tool = node['tool'];
  if ((node['kind'] !== 'tool' && node['type'] !== 'tool') || typeof tool !== 'string') {
    return null;
  }
  if (DROPPED_TOOLS.has(tool)) {
    return { value: node, calls: 0, left: [tool] };
  }
  const moved = convert({ tool, args: argsOf(node['args']) });
  if (moved === null) {
    return null;
  }
  return {
    value: { ...node, tool: moved.tool, args: JSON_VALUE.parse(moved.args) },
    calls: 1,
    left: [],
  };
}

const PORT_HOLDERS = ['ports', 'params'] as const;

function portsOf(node: Json): { readonly key: string; readonly ports: Json } | null {
  for (const key of PORT_HOLDERS) {
    const ports = node[key];
    if (ports !== undefined && isJson(ports)) {
      return { key, ports };
    }
  }
  return null;
}

function movedArgs(tool: string, port: JsonValue | undefined, args: Json): Rewrite {
  if (literal(port) !== undefined) {
    return { value: { lit: args }, calls: 0, left: [] };
  }
  if (Object.keys(args).length === 0) {
    return { value: port ?? null, calls: 0, left: [] };
  }
  if (port === undefined) {
    return { value: { lit: args }, calls: 0, left: [] };
  }
  return { value: port, calls: 0, left: [`${tool} with wired arguments`] };
}

function wiredCall(node: Json, convert: CallConversion): Rewrite | null {
  const held = node['kind'] === 'tool.call' ? portsOf(node) : null;
  const tool = held === null ? undefined : literal(held.ports['tool']);
  if (held === null || typeof tool !== 'string') {
    return null;
  }
  const port = held.ports['args'];
  const moved = convert({ tool, args: argsOf(literal(port)) });
  if (moved === null) {
    return DROPPED_TOOLS.has(tool) ? { value: node, calls: 0, left: [tool] } : null;
  }
  const args = movedArgs(tool, port, argsOf(JSON_VALUE.parse(moved.args)));
  const ports = {
    ...held.ports,
    tool: { lit: moved.tool },
    ...(args.value === null ? {} : { args: args.value }),
  };
  return { value: { ...node, [held.key]: ports }, calls: 1, left: args.left };
}

function rewriteChildren(value: JsonValue, convert: CallConversion): Rewrite {
  if (Array.isArray(value)) {
    const parts = value.map((child) => rewritten(child, convert));
    return combined(
      parts.map((part) => part.value),
      parts,
    );
  }
  if (!isJson(value)) {
    return { value, calls: 0, left: [] };
  }
  const entries = Object.entries(value).map(([key, child]) => [key, rewritten(child, convert)] as const);
  return combined(
    Object.fromEntries(entries.map(([key, part]) => [key, part.value])),
    entries.map(([, part]) => part),
  );
}

function combined(value: JsonValue, parts: readonly Rewrite[]): Rewrite {
  return {
    value,
    calls: parts.reduce((sum, part) => sum + part.calls, 0),
    left: parts.flatMap((part) => part.left),
  };
}

export function rewritten(value: JsonValue, convert: CallConversion): Rewrite {
  const inner = rewriteChildren(value, convert);
  if (!isJson(inner.value)) {
    return inner;
  }
  const own = scheduledCall(inner.value, convert) ?? wiredCall(inner.value, convert);
  return own === null
    ? inner
    : { value: own.value, calls: inner.calls + own.calls, left: [...inner.left, ...own.left] };
}
