import type { WakeSensitivity, WakeTestLine, WakeTestVerdict } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { background } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { silenceHallucination } from '../transcripts/heard-text';
import type { SpeechSegment } from './ear';

const MARK_SLACK_MS = 1000;

type WakeTestKind = 'camera' | 'phone' | 'computer';

export interface WakeTestSource {
  readonly kind: WakeTestKind;
  readonly key: string;
}

export interface WakeTestOptions {
  readonly connected: () => ReadonlySet<string>;
  readonly send: (clientId: string, line: WakeTestLine) => void;
  readonly transcribe: (pcm: Int16Array) => Promise<string | null>;
  readonly nearHears: (pcm: Int16Array, sensitivity: WakeSensitivity) => Promise<boolean>;
  readonly sensitivity: (source: WakeTestSource) => WakeSensitivity;
  readonly label: (source: WakeTestSource) => string;
  readonly id: () => string;
  readonly clock: Pick<Clock, 'now'>;
  readonly log: Logger;
}

interface Mark {
  readonly phrase: string;
  readonly at: number;
  readonly verdict: Extract<WakeTestVerdict, 'matched' | 'almost'>;
}

function keyOf(source: WakeTestSource): string {
  return `${source.kind}:${source.key}`;
}

export class WakeTest {
  private readonly watching = new Set<string>();
  private readonly marks = new Map<string, Mark>();
  private readonly listeners = new Set<(active: boolean) => void>();

  constructor(private readonly options: WakeTestOptions) {}

  watch(clientId: string, on: boolean): void {
    const before = this.active();
    if (on) {
      this.watching.add(clientId);
    } else {
      this.watching.delete(clientId);
    }
    this.settle(before);
  }

  active(): boolean {
    return this.watching.size > 0;
  }

  onActive(listener: (active: boolean) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  matched(source: WakeTestSource, phrase: string): void {
    this.mark(source, phrase, 'matched');
  }

  near(source: WakeTestSource, phrase: string): void {
    this.mark(source, phrase, 'almost');
  }

  segment(source: WakeTestSource, segment: SpeechSegment): void {
    if (this.active()) {
      background(this.judge(source, segment), 'wake_test.segment_failed');
    }
  }

  private mark(source: WakeTestSource, phrase: string, verdict: Mark['verdict']): void {
    if (this.active()) {
      this.marks.set(keyOf(source), { phrase, at: this.options.clock.now().getTime(), verdict });
    }
  }

  private settle(before: boolean): void {
    const after = this.active();
    if (!after) {
      this.marks.clear();
    }
    if (before !== after) {
      this.listeners.forEach((listener) => {
        listener(after);
      });
    }
  }

  private async judge(source: WakeTestSource, segment: SpeechSegment): Promise<void> {
    const text = await this.options.transcribe(segment.pcm);
    if (text !== null && silenceHallucination(text)) {
      return;
    }
    const mark = this.takeMark(source, segment);
    const verdict = await this.verdictOf(source, segment, mark);
    this.publish({
      id: this.options.id(),
      at: new Date(segment.startedAt).toISOString(),
      source: this.options.label(source),
      verdict,
      text,
      phrase: mark?.phrase ?? null,
    });
  }

  private takeMark(source: WakeTestSource, segment: SpeechSegment): Mark | null {
    const key = keyOf(source);
    const mark = this.marks.get(key);
    if (mark === undefined || mark.at < segment.startedAt - MARK_SLACK_MS) {
      return null;
    }
    this.marks.delete(key);
    return mark;
  }

  private async verdictOf(
    source: WakeTestSource,
    segment: SpeechSegment,
    mark: Mark | null,
  ): Promise<WakeTestVerdict> {
    if (mark !== null) {
      return mark.verdict;
    }
    return (await this.options.nearHears(segment.pcm, this.options.sensitivity(source)))
      ? 'almost'
      : 'heard';
  }

  private publish(line: WakeTestLine): void {
    const online = this.options.connected();
    [...this.watching].forEach((clientId) => {
      if (online.has(clientId)) {
        this.options.send(clientId, line);
      } else {
        this.watch(clientId, false);
      }
    });
  }
}
