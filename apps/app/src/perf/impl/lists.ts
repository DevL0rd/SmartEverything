import type { ListStat } from './collector';
import { DRAG_HOLD_MS, JANK_MS, SCROLL_SAMPLE_MS } from './config';

interface Cell {
  y: number;
  height: number;
}

interface Live {
  readonly list: string;
  readonly cells: Map<number, Cell>;
  mounted: number;
  total: number;
  viewport: number;
  content: number;
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
  if (cells.size === 0 || viewport <= 0) {
    return 0;
  }
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  cells.forEach((cell, index) => {
    first = Math.min(first, index);
    last = Math.max(last, index);
    from = Math.min(from, cell.y);
    to = Math.max(to, cell.y + cell.height);
  });
  const top = first === 0 ? 0 : Math.max(0, from - offset);
  const bottom = last >= total - 1 ? 0 : Math.max(0, offset + viewport - to);
  return Math.min(viewport, top + bottom);
}

export class ListTracker {
  private readonly lists = new Map<string, Live>();
  private readonly all: Live[] = [];

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
      list,
      cells: new Map(),
      mounted: 0,
      total: 0,
      viewport: 0,
      content: 0,
      scrolledAt: 0,
      sampledAt: 0,
      screen: this.screenOf(),
    };
    this.lists.set(list, made);
    this.all.push(made);
    return made;
  }

  private touchStat(list: string, live: Live): ListStat {
    const stat = this.statOf(list);
    stat.mountedMax = Math.max(stat.mountedMax, live.mounted);
    stat.mountedMin = Math.min(stat.mountedMin, live.mounted);
    stat.total = live.total;
    stat.viewport = live.viewport;
    stat.content = live.content;
    if (stat.lastIndex < 0 && live.cells.size > 0) {
      live.cells.forEach((cell, index) => {
        stat.firstIndex = Math.min(stat.firstIndex, index);
        stat.lastIndex = Math.max(stat.lastIndex, index);
        stat.cellMax = Math.max(stat.cellMax, cell.height);
      });
    }
    return stat;
  }

  rows(list: string, delta: number, total: number): void {
    const live = this.live(list);
    live.mounted = Math.max(0, live.mounted + delta);
    live.total = total >= 0 ? total : live.total;
    this.touchStat(list, live);
  }

  cell(list: string, index: number, y: number, height: number): void {
    const live = this.live(list);
    const known = live.cells.get(index);
    if (known === undefined) {
      live.cells.set(index, { y, height });
    } else {
      known.y = y;
      known.height = height;
    }
    const stat = this.touchStat(list, live);
    stat.firstIndex = Math.min(stat.firstIndex, index);
    stat.lastIndex = Math.max(stat.lastIndex, index);
    stat.cellMax = Math.max(stat.cellMax, height);
  }

  gone(list: string, index: number): void {
    this.live(list).cells.delete(index);
  }

  viewport(list: string, height: number): void {
    const live = this.live(list);
    live.viewport = height;
    this.touchStat(list, live);
  }

  content(list: string, height: number): void {
    const live = this.live(list);
    live.content = height;
    this.touchStat(list, live);
  }

  scroll(list: string, offset: number, now: number): void {
    const live = this.live(list);
    live.scrolledAt = now;
    if (now - live.sampledAt < SCROLL_SAMPLE_MS) {
      return;
    }
    live.sampledAt = now;
    const stat = this.touchStat(list, live);
    stat.offsetMax = Math.max(stat.offsetMax, offset);
    const blank = blankOf(live.cells, live.total, offset, live.viewport);
    stat.blankMax = Math.max(stat.blankMax, blank);
    stat.blankSum += blank;
    stat.blankSamples += 1;
  }

  frame(gap: number, now: number): void {
    let index = 0;
    while (index < this.all.length) {
      const live = this.all[index];
      if (live !== undefined && now - live.scrolledAt <= DRAG_HOLD_MS) {
        const stat = this.statOf(live.list);
        stat.scrollFrames += 1;
        stat.scrollJanks += gap > JANK_MS ? 1 : 0;
      }
      index += 1;
    }
  }

  seed(): void {
    this.lists.forEach((live, list) => {
      if (live.screen === this.screenOf()) {
        this.touchStat(list, live);
      }
    });
  }
}
