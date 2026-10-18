import type { RefObject } from 'react';
import { Logger } from '@smarteverything/logging';
import { LogTally } from './log-tally';
import { RearmTimer } from './rearm-timer';

const log = new Logger('app.design');
let members = 0;
const viewports = new LogTally(log, 'viewport.summarised', 10_000, () => ({ members }));

const SETTLE_MS = 120;

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

export interface Measurable {
  readonly measureInWindow: (
    done: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

export interface ViewportMember {
  readonly ref: RefObject<Measurable | null>;
  readonly margin: number;
  readonly change: (visible: boolean) => void;
}

export interface ViewportMembership {
  readonly measure: () => void;
  readonly leave: () => void;
}

interface Placement {
  readonly x: number;
  readonly contentY: number;
  readonly width: number;
  readonly height: number;
}

class Entry {
  private located: Placement | null = null;
  private visible: boolean | null = null;
  private measurement = 0;
  private joined = true;

  constructor(readonly member: ViewportMember) {}

  begin(): number | null {
    return this.joined ? ++this.measurement : null;
  }

  isCurrent(measurement: number): boolean {
    return this.joined && measurement === this.measurement;
  }

  retire(): boolean {
    const wasJoined = this.joined;
    this.joined = false;
    this.measurement++;
    return wasJoined;
  }

  get placement(): Placement | null {
    return this.located;
  }

  place(placement: Placement): void {
    this.located = placement;
  }

  report(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    viewports.bump(visible ? 'shown' : 'hidden');
    this.member.change(visible);
  }
}

export class ViewportRegistry {
  private readonly entries = new Set<Entry>();
  private offset = 0;
  private readonly settling = new RearmTimer(() => {
    this.measureAll();
  });

  constructor(
    private bounds: WindowSize,
    private readonly watching: (watching: boolean) => void,
  ) {}

  join(member: ViewportMember): ViewportMembership {
    const entry = new Entry(member);
    this.entries.add(entry);
    members += 1;
    viewports.bump('joined');
    if (this.entries.size === 1) this.watching(true);
    this.measure(entry);
    return {
      measure: (): void => {
        this.measure(entry);
      },
      leave: (): void => {
        this.leave(entry);
      },
    };
  }

  scrolled(offset: number): void {
    this.offset = offset;
    viewports.bump('scrolls');
    for (const entry of this.entries) this.apply(entry);
    this.settling.rearm(SETTLE_MS);
  }

  resized(bounds: WindowSize): void {
    if (bounds.width === this.bounds.width && bounds.height === this.bounds.height) return;
    this.bounds = bounds;
    this.measureAll();
  }

  dispose(): void {
    this.settling.cancel();
  }

  private leave(entry: Entry): void {
    if (!entry.retire()) return;
    this.entries.delete(entry);
    members -= 1;
    viewports.bump('left');
    if (this.entries.size === 0) this.watching(false);
  }

  private measureAll(): void {
    for (const entry of this.entries) this.measure(entry);
  }

  private measure(entry: Entry): void {
    const node = entry.member.ref.current;
    const measurement = entry.begin();
    if (node === null || measurement === null) return;
    const offset = this.offset;
    node.measureInWindow((x, y, width, height) => {
      if (!entry.isCurrent(measurement) || entry.member.ref.current !== node) return;
      entry.place({ x, contentY: y + offset, width, height });
      this.apply(entry);
    });
  }

  private apply(entry: Entry): void {
    const visible = this.visibleIn(entry);
    if (visible !== null) entry.report(visible);
  }

  private visibleIn({ placement, member }: Entry): boolean | null {
    if (placement === null) return null;
    const { x, width, height } = placement;
    const top = placement.contentY - this.offset;
    return (
      width > 0 &&
      height > 0 &&
      top < this.bounds.height + member.margin &&
      top + height > -member.margin &&
      x < this.bounds.width &&
      x + width > 0
    );
  }
}

export function inertViewport(): ViewportRegistry {
  return new ViewportRegistry({ width: 0, height: 0 }, () => undefined);
}
