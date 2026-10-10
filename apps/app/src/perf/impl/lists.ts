import type { ListStat } from './collector';
import { DRAG_HOLD_MS, JANK_MS, SCROLL_SAMPLE_MS } from './config';

interface Cell {
  readonly y: number;
  readonly height: number;
}

interface Live {
  readonly cells: Map<number, Cell>;
  mounted: number;
  total: number;
  viewport: number;
  scrolledAt: number;
  sampledAt: number;
  screen: string;
}

export function blankOf(
  cells: ReadonlyMap<number, Cell>,
  total: number,
  offset: number,
  viewport: number,
): number {
  const indexes = [...cells.keys()];
  if (indexes.length === 0 || viewport <= 0) {
    return 0;
  }
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  const from = Math.min(...[...cells.values()].map((cell) => cell.y));
  const to = Math.max(...[...cells.values()].map((cell) => cell.y + cell.height));
  const top = first === 0 ? 0 : Math.max(0, from - offset);
  const bottom = last >= total - 1 ? 0 : Math.max(0, offset + viewport - to);
  return Math.min(viewport, top + bottom);
}

export class ListTracker {
  private readonly lists = new Map<string, Live>();

  constructor(
    private readonly statOf: (list: string) => ListStat,
    private readonly screenOf: () => string,
  ) {}

  private live(list: string): Live {
    const found = this.lists.get(list);
    if (found !== undefined) {
      return found;
    }
    const made: Live = {
      cells: new Map(),
      mounted: 0,
      total: 0,
      viewport: 0,
      scrolledAt: 0,
      sampledAt: 0,
      screen: this.screenOf(),
    };
    this.lists.set(list, made);
    return made;
  }

  private touchStat(list: string, live: Live): ListStat {
    const stat = this.statOf(list);
    stat.mountedMax = Math.max(stat.mountedMax, live.mounted);
    stat.mountedMin = Math.min(stat.mountedMin, live.mounted);
    stat.total = live.total;
    return stat;
  }

  rows(list: string, delta: number, total: number): void {
    const live = this.live(list);
    live.mounted = Math.max(0, live.mounted + delta);
    live.total = total >= 0 ? total : live.total;
    this.touchStat(list, live);
  }

  cell(list: string, index: number, y: number, height: number): void {
    this.live(list).cells.set(index, { y, height });
  }

  gone(list: string, index: number): void {
    this.live(list).cells.delete(index);
  }

  viewport(list: string, height: number): void {
    this.live(list).viewport = height;
  }

  scroll(list: string, offset: number, now: number): void {
    const live = this.live(list);
    live.scrolledAt = now;
    if (now - live.sampledAt < SCROLL_SAMPLE_MS) {
      return;
    }
    live.sampledAt = now;
    const stat = this.touchStat(list, live);
    const blank = blankOf(live.cells, live.total, offset, live.viewport);
    stat.blankMax = Math.max(stat.blankMax, blank);
    stat.blankSum += blank;
    stat.blankSamples += 1;
  }

  frame(gap: number, now: number): void {
    for (const [list, live] of this.lists) {
      if (now - live.scrolledAt <= DRAG_HOLD_MS) {
        const stat = this.statOf(list);
        stat.scrollFrames += 1;
        stat.scrollJanks += gap > JANK_MS ? 1 : 0;
      }
    }
  }

  seed(): void {
    for (const [list, live] of this.lists) {
      if (live.screen === this.screenOf()) {
        this.touchStat(list, live);
      }
    }
  }
}
