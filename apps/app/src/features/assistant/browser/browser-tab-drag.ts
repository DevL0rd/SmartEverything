import type { ScrollView } from 'react-native';
import { ValueStore } from '../../../design/external-store';
import { insertedTabs } from './browser-tab-state';
const EDGE_ZONE = 28;
const EDGE_STEP = 6;
interface TabDragSnapshot {
  readonly order: readonly string[] | null;
  readonly id: string | null;
}
export class TabDrag {
  private readonly state = new ValueStore<TabDragSnapshot>({ order: null, id: null });
  private keys: readonly string[] = [];
  private width = 0;
  private rtl = false;
  private left = 0;
  private viewport = 0;
  private offset = 0;
  private edge = 0;
  private pointer = 0;
  private suppressed = false;
  private scroll: ScrollView | null = null;
  private frame: number | null = null;
  private releaseFrame: number | null = null;
  private commit: (order: readonly string[]) => void = (): void => undefined;
  readonly read = this.state.get;
  readonly subscribe = this.state.subscribe;
  configure(
    keys: readonly string[],
    layout: { readonly width: number; readonly rtl: boolean },
    commit: (order: readonly string[]) => void,
  ): void {
    if (this.read().id !== null && this.keys.join() !== keys.join()) this.drop(false);
    this.keys = keys;
    this.width = layout.width;
    this.rtl = layout.rtl;
    this.commit = commit;
  }
  attach(scroll: ScrollView | null): void {
    this.scroll = scroll;
  }
  measure(width: number, left: number): void {
    this.viewport = width;
    this.left = left;
  }
  scrolled(offset: number): void {
    this.offset = offset;
  }
  reveal(id: string): void {
    const index = this.keys.indexOf(id);
    const left = (this.rtl ? this.keys.length - index - 1 : index) * this.width;
    if (left < this.offset) this.scroll?.scrollTo({ x: left, animated: false });
    else if (left + this.width > this.offset + this.viewport)
      this.scroll?.scrollTo({ x: left + this.width - this.viewport, animated: false });
  }
  readonly start = (id: string, x: number): void => {
    this.suppressed = true;
    this.pointer = x;
    this.state.set({ id, order: this.keys });
  };
  readonly update = (x: number): void => {
    const active = this.read();
    if (active.id === null || active.order === null) return;
    this.pointer = x;
    const position = x - this.left + this.offset;
    const contentX = this.rtl ? this.keys.length * this.width - position : position;
    const order = active.order;
    const remaining = order.filter((id) => id !== active.id);
    const target =
      remaining.find((id) => contentX < order.indexOf(id) * this.width + this.width / 2) ?? null;
    this.state.set({ id: active.id, order: insertedTabs(active.order, active.id, target) });
    this.edge =
      x < this.left + EDGE_ZONE
        ? -EDGE_STEP
        : x > this.left + this.viewport - EDGE_ZONE
          ? EDGE_STEP
          : 0;
    if (this.edge === 0) this.stop();
    else this.frame ??= requestAnimationFrame(this.tick);
  };
  readonly drop = (success: boolean): void => {
    this.stop();
    const active = this.read();
    try {
      if (success && active.order !== null && active.order.join() !== this.keys.join())
        this.commit(active.order);
    } finally {
      this.state.set({ id: null, order: null });
      if (this.releaseFrame !== null) cancelAnimationFrame(this.releaseFrame);
      this.releaseFrame = requestAnimationFrame(() => {
        this.suppressed = false;
        this.releaseFrame = null;
      });
    }
  };
  consumePress(): boolean {
    const suppressed = this.suppressed;
    this.suppressed = false;
    return suppressed;
  }
  dispose(): void {
    this.stop();
    if (this.releaseFrame !== null) cancelAnimationFrame(this.releaseFrame);
    this.scroll = null;
  }
  private readonly tick = (): void => {
    if (this.read().id === null) return;
    this.frame = null;
    const max = Math.max(0, this.keys.length * this.width - this.viewport);
    this.offset = Math.max(0, Math.min(max, this.offset + this.edge));
    this.scroll?.scrollTo({ x: this.offset, animated: false });
    this.update(this.pointer);
  };
  private stop(): void {
    this.edge = 0;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
