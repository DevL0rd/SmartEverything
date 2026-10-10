import type { Stream } from 'node:stream';
import { Client } from '@modelcontextprotocol/client';
import {
  INBOUND_MESSAGE,
  PLUGIN_DATA_POINT,
  PLUGIN_EVENT,
  PLUGIN_NOTIFICATIONS,
  PLUGIN_SEARCH_ENTRY,
  type PluginManifest,
} from '@smarteverything/domain';
import { z } from 'zod';
import { failure, type HubToolResult } from '../ai-tools/hub-tool';
import type { Connection } from './connection';
import type { PluginRuntime, RuntimeSinks, RuntimeTool } from './runtime';
import { hubResultOf } from './tool-results';

const CALL_TIMEOUT_MS = 120_000;

const CLIENT_INFO = { name: 'SmartEverything', version: '1.0.0' };

const LISTED_TOOL = z.looseObject({
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).default(''),
  inputSchema: z.record(z.string(), z.unknown()),
  annotations: z
    .looseObject({
      title: z.string().optional(),
      readOnlyHint: z.boolean().default(false),
      destructiveHint: z.boolean().optional(),
      openWorldHint: z.boolean().default(true),
    })
    .prefault({}),
});

const SEARCH_PUSH = z.strictObject({ entries: z.array(PLUGIN_SEARCH_ENTRY).max(500) });

function runtimeTool(raw: unknown, log: (line: string) => void): RuntimeTool[] {
  const parsed = LISTED_TOOL.safeParse(raw);
  if (!parsed.success) {
    log(`Skipped a tool SmartEverything cannot read: ${parsed.error.issues[0]?.message ?? ''}`);
    return [];
  }
  const { annotations, ...tool } = parsed.data;
  return [
    {
      name: tool.name,
      title: tool.title ?? annotations.title ?? tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: annotations.readOnlyHint,
        destructiveHint: annotations.destructiveHint ?? !annotations.readOnlyHint,
        openWorldHint: annotations.openWorldHint,
      },
      humanOnly: false,
    },
  ];
}

function followLines(stream: Stream | null, sink: (line: string) => void): void {
  let partial = '';
  stream?.on('data', (chunk: unknown) => {
    const text = partial + (Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    const lines = text.split('\n');
    partial = lines.pop() ?? '';
    lines.forEach(sink);
  });
}

export class McpRuntime implements PluginRuntime {
  private client: Client | null = null;
  private listed: readonly RuntimeTool[] = [];
  private stopping = false;

  constructor(
    private readonly manifest: PluginManifest,
    private readonly connect: () => Connection,
    private readonly sinks: RuntimeSinks,
  ) {}

  async start(): Promise<void> {
    this.stopping = false;
    const connection = this.connect();
    const client = new Client(CLIENT_INFO, { capabilities: {} });
    this.listen(client);
    followLines(connection.stderr, this.sinks.log);
    client.onclose = (): void => {
      this.closed(client);
    };
    await client.connect(connection.transport);
    this.client = client;
    await this.refreshTools();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const client = this.client;
    this.client = null;
    this.listed = [];
    await client?.close();
  }

  tools(): readonly RuntimeTool[] {
    return this.listed;
  }

  async call(name: string, args: Readonly<Record<string, unknown>>): Promise<HubToolResult> {
    if (this.client === null) {
      return failure(`${this.manifest.name} is not running`);
    }
    const result = await this.client.callTool(
      { name, arguments: { ...args } },
      { timeout: CALL_TIMEOUT_MS },
    );
    return hubResultOf(result);
  }

  private closed(client: Client): void {
    if (this.client !== client && this.client !== null) {
      return;
    }
    this.client = null;
    this.listed = [];
    this.sinks.toolsChanged();
    if (!this.stopping) {
      this.sinks.status('crashed', `${this.manifest.name} stopped unexpectedly`);
    }
  }

  private async refreshTools(): Promise<void> {
    const client = this.client;
    if (client === null) {
      return;
    }
    const listed = await client.listTools();
    this.listed = listed.tools.flatMap((tool) => runtimeTool(tool, this.sinks.log));
    this.sinks.toolsChanged();
  }

  private listen(client: Client): void {
    client.setNotificationHandler('notifications/tools/list_changed', () => {
      this.refreshTools().catch((cause: unknown) => {
        this.sinks.log(`Could not refresh the tool list: ${String(cause)}`);
      });
    });
    client.setNotificationHandler(
      PLUGIN_NOTIFICATIONS.message,
      { params: INBOUND_MESSAGE },
      (message) => {
        this.sinks.message(message);
      },
    );
    client.setNotificationHandler(
      PLUGIN_NOTIFICATIONS.data,
      { params: PLUGIN_DATA_POINT },
      (point) => {
        this.sinks.data(point);
      },
    );
    client.setNotificationHandler(PLUGIN_NOTIFICATIONS.event, { params: PLUGIN_EVENT }, (event) => {
      this.sinks.event(event);
    });
    client.setNotificationHandler(PLUGIN_NOTIFICATIONS.search, { params: SEARCH_PUSH }, (push) => {
      this.sinks.search(push.entries);
    });
  }
}
