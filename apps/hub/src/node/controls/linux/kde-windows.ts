import type { WindowAction, WindowRow } from '@smarteverything/domain';
import type { DesktopEntries } from './desktop-entries';
import type { KdeBridge } from './kde-bridge';
import type { WindowProvider } from './window-provider';
import { windowApp } from './window-app';

export type WindowBridge = Pick<KdeBridge, 'listWindows' | 'actOnWindow' | 'watchWindows'>;

export class KdeWindows implements WindowProvider {
  constructor(
    private readonly bridge: () => WindowBridge,
    private readonly entries: DesktopEntries,
  ) {}

  async list(): Promise<WindowRow[]> {
    const windows = await this.bridge().listWindows();
    return windows.map((window) => ({
      id: window.id,
      title: window.title,
      app:
        window.desktopFile === '' && window.resourceClass === ''
          ? null
          : windowApp(this.entries, window.desktopFile, window.resourceClass),
      desktop: window.desktops.length === 0 ? null : window.desktops.join(', '),
      minimised: window.minimized,
      focused: window.active,
    }));
  }

  act(windowId: string, action: WindowAction): Promise<boolean> {
    return this.bridge().actOnWindow(windowId, action);
  }

  watch(onChange: () => void, onFailure: (cause: unknown) => void): Promise<() => void> {
    return this.bridge().watchWindows(onChange, onFailure);
  }
}
