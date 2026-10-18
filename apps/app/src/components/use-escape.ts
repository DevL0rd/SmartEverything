import { useEffect, useEffectEvent, type RefObject } from 'react';
import { isNative } from '../design/platform';

interface EscapeHandler {
  readonly run: () => void;
  readonly eligible: () => boolean;
}

interface EscapeLayer extends EscapeHandler {
  readonly commit: number;
  readonly order: number;
}

function outranks(entry: EscapeLayer, best: EscapeLayer): boolean {
  return entry.commit > best.commit || (entry.commit === best.commit && entry.order < best.order);
}

export class EscapeStack {
  private readonly layers: EscapeLayer[] = [];

  private commit = 0;

  private order = 0;

  private pending = false;

  get size(): number {
    return this.layers.length;
  }

  push(handler: EscapeHandler): () => void {
    if (!this.pending) {
      this.pending = true;
      this.order = 0;
      this.commit += 1;
      queueMicrotask((): void => {
        this.pending = false;
      });
    }
    this.order += 1;
    const layer = { ...handler, commit: this.commit, order: this.order };
    this.layers.push(layer);
    return (): void => {
      const index = this.layers.lastIndexOf(layer);
      if (index >= 0) {
        this.layers.splice(index, 1);
      }
    };
  }

  fire(): boolean {
    const layer = this.layers.reduce<EscapeLayer | undefined>(
      (best, entry) =>
        entry.eligible() && (best === undefined || outranks(entry, best)) ? entry : best,
      undefined,
    );
    layer?.run();
    return layer !== undefined;
  }
}

const stack = new EscapeStack();

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !event.isComposing && stack.fire()) {
    event.stopPropagation();
  }
}

function enter(layer: EscapeHandler): () => void {
  if (stack.size === 0) {
    document.addEventListener('keydown', onKeyDown, { capture: true });
  }
  const leave = stack.push(layer);
  return (): void => {
    leave();
    if (stack.size === 0) {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    }
  };
}

function focusInside(scope: RefObject<unknown>): boolean {
  const node = scope.current;
  return node instanceof Node && node.contains(document.activeElement);
}

export function useEscape(active: boolean, onEscape: () => void, scope?: RefObject<unknown>): void {
  const run = useEffectEvent(onEscape);
  useEffect(() => {
    if (!active || isNative()) {
      return undefined;
    }
    return enter({
      run,
      eligible: () => scope === undefined || focusInside(scope),
    });
  }, [active, scope]);
}
