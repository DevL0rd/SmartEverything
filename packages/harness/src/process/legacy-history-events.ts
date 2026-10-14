import {
  CHAT_TIMELINE_EMBED,
  COMPACTION_EMBED,
  DSH_SESSION_EVENTS_WRITE,
  JSON_VALUE,
} from '@smarteverything/domain';
import { foldSurface } from '@deepseek-ai/dsh-session';
import type {
  AssistantMessageRow,
  JsonValue,
  DshSessionEvent,
  ChatTimelinePart,
} from '@smarteverything/domain';
import { readNativeHistory } from './history';

export class LegacyHistoryEvents {
  private readonly events: DshSessionEvent[] = [];
  private turn = 0;
  private step = 0;
  private readonly compactionNotes = new Set<number>();

  constructor(private readonly header: unknown) {
    this.event(
      'system/message',
      {
        turn: 0,
        step: 0,
        message: {
          id: 'smarteverything-import-system',
          role: 'system',
          source: { kind: 'system-prompt' },
          content: [],
        },
      },
      0,
      { surface: true },
    );
  }

  append(row: AssistantMessageRow, attachments: readonly JsonValue[]): void {
    const time = Date.parse(row.created_at);
    this.event('plugin:smarteverything/legacy-message', JSON_VALUE.parse(row), time, {
      ignorable: true,
    });
    this.event('turn/start', { turn: this.turn }, time);
    this.step = 0;
    this.event('step/start', this.position(), time);
    if (row.role === 'responder') this.assistant(row, attachments, time);
    else this.recall(row, attachments, time);
    this.event('step/end', this.position(), time);
    this.event(
      'turn/end',
      { turn: this.turn, reason: { kind: row.state === 'failed' ? 'interrupted' : 'completed' } },
      time,
    );
    this.turn += 1;
  }

  history(): ReturnType<typeof readNativeHistory> {
    return readNativeHistory(this.header, DSH_SESSION_EVENTS_WRITE.parse(this.events));
  }

  private recall(row: AssistantMessageRow, attachments: readonly JsonValue[], time: number): void {
    const compact = row.embeds
      .map((embed) => COMPACTION_EMBED.safeParse(embed))
      .find((entry) => entry.success);
    const sources =
      compact?.success === true ? this.compactedSources(Date.parse(compact.data.through_at)) : [];
    if (compact?.success === true) this.compactionNotes.add(this.events.length);
    this.event(
      'user/message',
      {
        id: row.id,
        role: 'user',
        source: {
          kind: 'smarteverything-history',
          original_role: row.role,
          origin: JSON_VALUE.parse(row.origin),
          author: row.author,
          form:
            row.origin?.source === 'chat' || row.origin?.source === 'subagent' ? 'relay' : 'recall',
        },
        content: [{ type: 'text', text: historyText(row) }, ...attachments],
      },
      time,
      { surface: true, sources },
    );
  }

  private compactedSources(through: number): readonly number[] {
    const history = this.history();
    return foldSurface(history).nodes.filter((seq) => {
      const event = history[seq];
      return (
        event !== undefined &&
        event.type !== 'system/message' &&
        (event.time <= through || this.compactionNotes.has(seq))
      );
    });
  }

  private assistant(
    row: AssistantMessageRow,
    attachments: readonly JsonValue[],
    time: number,
  ): void {
    const timeline = row.embeds
      .map((embed) => CHAT_TIMELINE_EMBED.safeParse(embed))
      .find((parsed) => parsed.success);
    const parts: readonly ChatTimelinePart[] =
      timeline?.success === true
        ? timeline.data.parts
        : [{ kind: 'text', key: row.id, text: row.text }];
    for (const [index, part] of parts.entries()) {
      if (part.kind === 'tool') this.tool(row, part, index, time);
      else this.message(row, [{ type: part.kind, text: part.text }], index, time);
    }
    if (attachments.length > 0) this.message(row, attachments, parts.length, time);
  }

  private message(
    row: AssistantMessageRow,
    content: readonly JsonValue[],
    index: number,
    time: number,
  ): void {
    this.event(
      'assistant/message',
      {
        ...this.position(),
        message: {
          id: `${row.id}:${String(index)}`,
          role: 'assistant',
          source: {
            kind: 'model',
            provider: 'openrouter',
            model: row.model ?? 'smarteverything/unknown-historical-model',
          },
          content: [...content],
        },
        stream: [],
      },
      time,
      { surface: true },
    );
  }

  private tool(
    row: AssistantMessageRow,
    part: Extract<ChatTimelinePart, { kind: 'tool' }>,
    index: number,
    time: number,
  ): void {
    const { tool } = part;
    const argumentsText = tool.input ?? '';
    this.message(
      row,
      [{ type: 'tool-call', id: tool.callId, name: tool.name, arguments: argumentsText }],
      index,
      time,
    );
    this.event(
      'tool/call',
      { ...this.position(), callId: tool.callId, name: tool.name, arguments: argumentsText },
      time,
    );
    this.event(
      'tool/result',
      {
        ...this.position(),
        message: {
          id: `${row.id}:${tool.callId}:result`,
          role: 'tool',
          source: { kind: 'tool', callId: tool.callId },
          toolCallId: tool.callId,
          isError: tool.state !== 'done',
          content: [{ type: 'text', text: tool.output ?? tool.detail ?? '' }],
        },
        meta: { historical_receipt: JSON_VALUE.parse(tool), imported: true },
      },
      time,
      { surface: true },
    );
    this.event('step/end', this.position(), time);
    this.step += 1;
    this.event('step/start', this.position(), time);
  }

  private position(): { readonly turn: number; readonly step: number } {
    return { turn: this.turn, step: this.step };
  }

  private event(
    type: string,
    data: JsonValue,
    time: number,
    options: {
      readonly surface?: boolean;
      readonly ignorable?: boolean;
      readonly sources?: readonly number[];
    } = {},
  ): void {
    this.events.push({
      type,
      seq: this.events.length,
      time,
      data,
      ...surfaceIntent(options),
      ...(options.ignorable === true ? { ignorable: true as const } : {}),
    });
  }
}

function surfaceIntent(options: {
  readonly surface?: boolean;
  readonly sources?: readonly number[];
}): Record<string, JsonValue> {
  if (options.surface !== true) return {};
  const first = options.sources?.[0];
  const last = options.sources?.at(-1);
  return first === undefined || last === undefined
    ? { surfaceOp: 'append' }
    : {
        surfaceOp: { op: 'replace', startSeq: first, endSeq: last },
        sourceEventSeqs: [...(options.sources ?? [])],
      };
}

function historyText(row: AssistantMessageRow): string {
  if (row.role === 'system')
    return `[${row.kind === 'call' ? 'Voice call transcript' : 'Note'}] ${row.text}`;
  const from =
    row.origin?.source === 'chat' || row.origin?.source === 'subagent' ? row.origin.name : null;
  return from === null ? row.text : `[From the chat "${from}", an AI, not the person] ${row.text}`;
}
