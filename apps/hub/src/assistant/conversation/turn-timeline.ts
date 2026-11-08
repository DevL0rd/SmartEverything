import type {
  ChatTimelineEmbed,
  ChatTimelinePart,
  ChatTimelineTool,
  ChatToolItem,
} from '@smarteverything/domain';
import { REDACTED } from '@smarteverything/logging';
import { replayBoundaries } from './replay-boundaries';
import { toolTimelineDetails, type ToolTimelineDetails } from './tool-timeline-details';

export class TurnTimeline {
  private parts: ChatTimelinePart[] = [];
  private persist: ((timeline: ChatTimelineEmbed) => void) | null = null;
  private dirty = false;
  bind(persist: (timeline: ChatTimelineEmbed) => void): void {
    this.persist = persist;
  }
  text(kind: 'text' | 'reasoning', delta: string): void {
    this.dirty = true;
    const last = this.parts.at(-1);
    if (last?.kind === kind) {
      this.parts[this.parts.length - 1] = { ...last, text: last.text + delta };
      return;
    }
    this.parts.push({ kind, key: `${kind}:${String(this.parts.length)}`, text: delta });
  }
  tool(item: ChatToolItem, details: ToolTimelineDetails): void {
    this.dirty = true;
    const index = this.parts.findIndex(
      (part) => part.kind === 'tool' && part.tool.callId === item.callId,
    );
    const previous = this.parts[index];
    const tool = updatedTool(item, details, previous?.kind === 'tool' ? previous.tool : null);
    const part: ChatTimelinePart = { kind: 'tool', key: item.callId, tool };
    if (index < 0) this.parts.push(part);
    else this.parts[index] = part;
  }
  steer(messageId: string): void {
    if (this.parts.some((part) => part.kind === 'steer' && part.message_id === messageId)) return;
    this.dirty = true;
    this.parts.push({ kind: 'steer', key: `steer:${messageId}`, message_id: messageId });
  }
  restore(timeline: ChatTimelineEmbed): void {
    this.dirty = true;
    const saved = new Map(timeline.parts.map((part) => [part.key, part]));
    this.parts = this.parts.flatMap((part): ChatTimelinePart[] => {
      if (part.kind === 'tool' || part.kind === 'steer') return [part];
      const previous = saved.get(part.key);
      return previous === undefined ? [] : [previous];
    });
  }
  replayBoundaries(saved: ChatTimelineEmbed): void {
    this.parts = replayBoundaries(saved, this.current()).parts;
    this.dirty = true;
  }
  finish(interrupted: boolean): void {
    if (!this.parts.some(running)) return;
    this.dirty = true;
    this.parts = this.parts.map((part) =>
      running(part)
        ? { ...part, tool: { ...part.tool, state: interrupted ? 'interrupted' : 'unknown' } }
        : part,
    );
  }
  current(): ChatTimelineEmbed {
    return { kind: 'chat_timeline', version: 1, parts: [...this.parts] };
  }
  flush(): void {
    if (this.persist === null || !this.dirty) return;
    this.persist(this.current());
    this.dirty = false;
  }
}

function running(part: ChatTimelinePart): part is Extract<ChatTimelinePart, { kind: 'tool' }> {
  return part.kind === 'tool' && part.tool.state === 'running';
}

function updatedTool(
  item: ChatToolItem,
  details: ToolTimelineDetails,
  previous: ChatTimelineTool | null,
): ChatTimelineTool {
  const reported = toolTimelineDetails(item.name, details, item.callId);
  const current = {
    ...item,
    ...reported,
    detail: reported.redacted ? REDACTED : item.detail,
    state: details.state ?? item.state,
  };
  if (previous === null) return current;
  return {
    ...current,
    input: reported.input ?? previous.input,
    output: reported.output ?? previous.output,
    redacted: reported.redacted || previous.redacted,
    image_operation_id: reported.image_operation_id ?? previous.image_operation_id,
  };
}
