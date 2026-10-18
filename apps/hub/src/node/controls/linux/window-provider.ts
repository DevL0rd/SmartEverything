import type { WindowAction, WindowRow } from '@smarteverything/domain';

export interface WindowProvider {
  readonly list: () => Promise<WindowRow[]>;
  readonly act: (windowId: string, action: WindowAction) => Promise<boolean>;
  readonly watch: (
    onChange: () => void,
    onFailure: (cause: unknown) => void,
  ) => Promise<() => void>;
}
