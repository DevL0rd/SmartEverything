import { fanStat, type FanStat, type WindowData } from './collector';

export class FanNode {
  readonly label: string;
  readonly children = new Map<string, FanNode>();
  private stat: FanStat | null = null;
  private window = -1;

  constructor(
    readonly prefix: string,
    readonly tail: string,
  ) {
    this.label = `${prefix}:${tail}`;
  }

  statFor(window: number, data: WindowData): FanStat {
    if (this.window !== window || this.stat === null) {
      this.stat = fanStat(data, this.label);
      this.window = window;
    }
    return this.stat;
  }
}

export class FanKeys {
  private readonly roots = new Map<string, FanNode>();
  private window = 0;

  nextWindow(): void {
    this.window += 1;
  }

  root(prefix: string): FanNode {
    let node = this.roots.get(prefix);
    if (node === undefined) {
      node = new FanNode(prefix, '');
      this.roots.set(prefix, node);
    }
    return node;
  }

  child(parent: FanNode, key: string, joiner: string): FanNode {
    let node = parent.children.get(key);
    if (node === undefined) {
      node = new FanNode(parent.prefix, parent.tail === '' ? key : `${parent.tail}${joiner}${key}`);
      parent.children.set(key, node);
    }
    return node;
  }

  statOf(node: FanNode, data: WindowData): FanStat {
    return node.statFor(this.window, data);
  }
}
