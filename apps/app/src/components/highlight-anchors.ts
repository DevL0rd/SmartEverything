import type { RefObject } from 'react';
import type { View } from 'react-native';
import { ValueStore } from '../design/external-store';
import type { ScreenScroll } from './screen-context';

export interface AnchorEntry {
  readonly key: string;
  readonly label: string;
  readonly ref: RefObject<View | null>;
  readonly scroll: ScreenScroll | null;
}

interface PendingHighlight {
  readonly keys: readonly string[];
  readonly outcome: Promise<boolean>;
  readonly settle: (shown: boolean) => void;
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

export class HighlightRegistry {
  readonly shown = new ValueStore<AnchorEntry | null>(null);

  private readonly anchors = new Map<string, AnchorEntry>();

  private pending: PendingHighlight | null = null;

  readonly register = (entry: AnchorEntry): (() => void) => {
    this.anchors.set(entry.key, entry);
    const waiting = this.pending;
    if (waiting?.keys.includes(entry.key) === true) {
      this.pending = null;
      this.shown.set(entry);
      waiting.settle(true);
    }
    return (): void => {
      if (this.anchors.get(entry.key) === entry) {
        this.anchors.delete(entry.key);
      }
      if (this.shown.get() === entry) {
        this.shown.set(null);
      }
    };
  };

  readonly present = (keys: readonly string[]): boolean =>
    keys.some((key) => this.anchors.has(key));

  readonly request = (keys: readonly string[], until: AbortSignal): Promise<boolean> => {
    const shown = this.shown.get();
    if (shown !== null && keys.includes(shown.key)) {
      return Promise.resolve(true);
    }
    if (this.pending !== null && sameKeys(this.pending.keys, keys)) {
      return this.pending.outcome;
    }
    this.clear();
    const found = keys.map((key) => this.anchors.get(key)).find((entry) => entry !== undefined);
    if (found !== undefined) {
      this.shown.set(found);
      return Promise.resolve(true);
    }
    return this.wait(keys, until);
  };

  private wait(keys: readonly string[], until: AbortSignal): Promise<boolean> {
    let settle: (shown: boolean) => void = () => undefined;
    const outcome = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    const waiting: PendingHighlight = { keys, outcome, settle };
    this.pending = waiting;
    const giveUp = (): void => {
      if (this.pending === waiting) {
        this.pending = null;
        settle(false);
      }
    };
    if (until.aborted) {
      giveUp();
    } else {
      until.addEventListener('abort', giveUp, { once: true });
    }
    return outcome;
  }

  readonly clear = (): void => {
    this.shown.set(null);
    const waiting = this.pending;
    this.pending = null;
    waiting?.settle(false);
  };
}

export const highlights = new HighlightRegistry();
