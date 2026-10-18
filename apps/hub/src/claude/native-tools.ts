import { randomUUID } from 'node:crypto';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { COMPUTER_AI_NATIVE_TOOL } from '@smarteverything/domain';
import { z } from 'zod';
import { ClaudeNotReadyError } from './errors';
import { nativeSchemas } from './native-schemas';
import type { ModStreams } from './streams';
import { messageOf } from '@smarteverything/logging';

const TOOL_LIST = z.array(
  z.looseObject({ name: z.string().min(1), description: z.string(), mcp: z.boolean() }),
);
const TOOLS_REPORT = z.looseObject({ root: z.string().min(1), tools: TOOL_LIST });
type NativeTool = z.infer<typeof COMPUTER_AI_NATIVE_TOOL>;
const RESERVED_ARGUMENTS = new Set(['tool', 'tool_use_id', 'agentId', 'consent']);

export class NativeTools {
  private readonly discovered = new Map<string, NativeTool[]>();
  private readonly discovering = new Set<string>();
  private readonly active = new Map<
    string,
    { session: string; name: string; input: Record<string, JsonValue> }
  >();
  constructor(
    private readonly streams: ModStreams,
    private readonly scratch: string,
    private readonly changed?: () => void,
    private readonly failed?: (cause: unknown) => void,
  ) {}

  cached(sessionId: string | undefined): readonly NativeTool[] {
    const attached = sessionId ?? this.streams.sessions().at(0);
    return attached === undefined ? [] : (this.discovered.get(attached) ?? []);
  }

  discover(session: string): void {
    if (this.discovered.has(session) || this.discovering.has(session)) return;
    this.discovering.add(session);
    void this.list(session)
      .finally(() => this.discovering.delete(session))
      .catch((cause: unknown) => {
        this.failed?.(cause);
        this.discovered.set(session, []);
        this.changed?.();
      });
  }

  connected(session: string): boolean {
    return this.streams.has(session);
  }

  permits(session: string, name: string, input: Readonly<Record<string, unknown>>): boolean {
    return [...this.active.values()].some(
      (call) =>
        call.session === session &&
        call.name === name &&
        Object.entries(call.input).every(
          ([key, value]) => JSON.stringify(input[key]) === JSON.stringify(value),
        ),
    );
  }

  async list(sessionId: string | undefined): Promise<NativeTool[]> {
    const attached = sessionId ?? this.streams.sessions().at(0);
    if (attached === undefined) {
      throw new ClaudeNotReadyError(
        'native_tools_list',
        'No native Claude session has connected its official mod.',
      );
    }
    const report = TOOLS_REPORT.parse(await this.streams.request(attached, { op: 'tools' }));
    try {
      const schemas = await nativeSchemas(report.root, this.scratch);
      const tools = report.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: schemas.get(tool.name) ?? null,
        reason: schemas.has(tool.name)
          ? null
          : 'This installed build did not emit a schema for this tool.',
      }));
      this.discovered.set(attached, tools);
      this.changed?.();
      return tools;
    } catch (cause) {
      const reason = messageOf(cause).slice(0, 500);
      return report.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: null,
        reason,
      }));
    }
  }

  async call(
    sessionId: string | undefined,
    name: string,
    args: Record<string, JsonValue>,
  ): Promise<JsonValue> {
    const tool = (await this.list(sessionId)).find((entry) => entry.name === name);
    if (tool === undefined) {
      throw new ClaudeNotReadyError(
        'native_tools_call',
        'The attached harness does not offer this tool.',
      );
    }
    if (tool.input_schema === null) {
      throw new ClaudeNotReadyError(
        'native_tools_call',
        tool.reason ?? 'The tool has no verified input schema.',
      );
    }
    const reserved = Object.keys(args).find((key) => RESERVED_ARGUMENTS.has(key));
    if (reserved !== undefined) {
      throw new ClaudeNotReadyError(
        'native_tools_call',
        `The native envelope field ${reserved} cannot be supplied as a tool argument.`,
      );
    }
    const validated = z.fromJSONSchema(tool.input_schema).parse(args);
    const input = z.record(z.string(), JSON_VALUE).parse(validated);
    const attached = sessionId ?? this.streams.sessions().at(0);
    if (attached === undefined)
      throw new ClaudeNotReadyError('native_tools_call', 'No native session is attached.');
    const id = randomUUID();
    this.active.set(id, { session: attached, name, input });
    try {
      return await this.streams.request(attached, { op: 'tool', name, arguments: input });
    } finally {
      this.active.delete(id);
    }
  }
}
