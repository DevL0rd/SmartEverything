import type {
  ChatTimelineEmbed,
  ChatTimelinePart,
  ChatTimelineTool,
  ChatToolItem,
} from '@smarteverything/domain';
import { REDACTED } from '@smarteverything/logging';
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
  restore(timeline: ChatTimelineEmbed): void {
    this.dirty = true;
    const tools = this.parts.filter((part) => part.kind === 'tool');
    this.parts = timeline.parts.map((part) =>
      part.kind === 'tool'
        ? (tools.find((current) => current.tool.callId === part.tool.callId) ?? part)
        : part,
    );
    for (const part of tools)
      if (
        !this.parts.some(
          (current) => current.kind === 'tool' && current.tool.callId === part.tool.callId,
        )
      )
        this.parts.push(part);
  }
  clear(): void {
    this.dirty = true;
    this.parts = [];
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
  const reported = toolTimelineDetails(item.name, details);
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
