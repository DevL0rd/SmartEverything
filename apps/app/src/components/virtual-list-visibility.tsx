import type { ReactNode } from 'react';
import { usePausable } from '../design/external-store';
import { useState } from 'react';
import type { ViewabilityConfig } from 'react-native';
import { VisualVisibility } from '../design/visibility';

export class RowVisibility {
  private viewable: ReadonlySet<string> | null = null;
  private readonly listeners = new Map<string, Set<() => void>>();

  readonly visible = (key: string): boolean => this.viewable === null || this.viewable.has(key);

  readonly replace = (keys: ReadonlySet<string>): void => {
    const before = this.viewable;
    this.viewable = keys;
    for (const key of this.listeners.keys()) {
      const was = before === null || before.has(key);
      if (was !== this.visible(key)) this.notify(key);
    }
  };

  readonly subscribe = (key: string, listener: () => void): (() => void) => {
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return (): void => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  };

  private notify(key: string): void {
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
}

export interface ViewableToken {
  readonly key: string;
  readonly index: number | null;
  readonly isViewable: boolean;
}

export interface ViewableChange {
  readonly viewableItems: readonly ViewableToken[];
}

export interface RowTracking {
  readonly rows: RowVisibility;
  readonly pairs: {
    readonly viewabilityConfig: ViewabilityConfig;
    readonly onViewableItemsChanged: (change: ViewableChange) => void;
  }[];
}

export function useRowTracking(onChange?: (change: ViewableChange) => void): RowTracking {
  const [tracking] = useState<RowTracking>(() => {
    const rows = new RowVisibility();
    return {
      rows,
      pairs: [
        {
          viewabilityConfig: { viewAreaCoveragePercentThreshold: 0 },
          onViewableItemsChanged: (change): void => {
            rows.replace(new Set(change.viewableItems.map((token) => token.key)));
            onChange?.(change);
          },
        },
      ],
    };
  });
  return tracking;
}

export function RowScope({
  rows,
  rowKey,
  children,
}: {
  readonly rows: RowVisibility;
  readonly rowKey: string;
  readonly children: ReactNode;
}): ReactNode {
  const visible = usePausable(
    (listener) => rows.subscribe(rowKey, listener),
    () => rows.visible(rowKey),
  );
  return <VisualVisibility visible={visible}>{children}</VisualVisibility>;
}
