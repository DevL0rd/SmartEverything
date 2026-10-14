import { isReplacementSurfaceEvent } from '@deepseek-ai/dsh-session';
import { nativeToolOutput, type readNativeHistory } from '@smarteverything/harness/process';
import type { ChatTimelineEmbed } from '@smarteverything/domain';
import { TurnTimeline } from '../../conversation/turn-timeline';

type NativeHistory = ReturnType<typeof readNativeHistory>;
export function historyTimeline(history: NativeHistory, interrupted: boolean): ChatTimelineEmbed {
  const timeline = new TurnTimeline();
  const names = new Map<string, string>();
  for (const record of history) feedHistory(timeline, names, record);
  timeline.finish(interrupted);
  return timeline.current();
}

function feedHistory(
  timeline: TurnTimeline,
  names: Map<string, string>,
  record: NativeHistory[number],
): void {
  if (isReplacementSurfaceEvent(record)) return;
  if (record.type === 'assistant/message') feedAssistant(timeline, names, record);
  if (record.type === 'tool/call') {
    names.set(record.data.callId, record.data.name);
    timeline.tool(
      {
        callId: record.data.callId,
        name: record.data.name,
        title: record.data.name,
        state: 'running',
        detail: null,
      },
      { input: record.data.arguments },
    );
  }
  if (record.type === 'tool/result') {
    const message = record.data.message;
    const name = names.get(message.toolCallId);
    if (name === undefined)
      throw new Error('Native tool history is missing its original call identity.');
    timeline.tool(
      {
        callId: message.toolCallId,
        name,
        title: name,
        state: message.isError === true ? 'failed' : 'done',
        detail: null,
      },
      {
        output: nativeToolOutput(record.data),
      },
    );
  }
}

function feedAssistant(
  timeline: TurnTimeline,
  names: Map<string, string>,
  record: Extract<NativeHistory[number], { type: 'assistant/message' }>,
): void {
  for (const block of record.data.message.content) {
    if (block.type === 'text' || block.type === 'reasoning') timeline.text(block.type, block.text);
    if (block.type === 'tool-call') {
      names.set(block.id, block.name);
      timeline.tool(
        {
          callId: block.id,
          name: block.name,
          title: block.name,
          state: 'running',
          detail: null,
        },
        { input: block.arguments },
      );
    }
  }
}
