import type { AutomationTraceNotice } from '@smarteverything/domain';
import type { LiveSinkParts } from './driver/live-sink';

export type TraceLink = Pick<LiveSinkParts, 'watched' | 'publish'>;

export class AutomationTraceSlot {
  private link: TraceLink | null = null;

  attach(link: TraceLink): () => void {
    this.link = link;
    return (): void => {
      if (this.link === link) this.link = null;
    };
  }

  readonly watched = (subject: string): boolean => this.link?.watched(subject) ?? false;

  readonly publish = (notice: AutomationTraceNotice): void => {
    this.link?.publish(notice);
  };
}
