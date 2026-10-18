import { useEffect } from 'react';
import { Logger } from '@smarteverything/logging';

export const pluginLog = new Logger('app.plugins');

export function failureKind(error: unknown): { readonly kind: string; readonly message: string } {
  if (error instanceof Error) {
    return { kind: error.name, message: error.message.slice(0, 200) };
  }
  return { kind: typeof error, message: '' };
}

export function usePluginScreen(pluginId: string, screen: string): void {
  useEffect(() => {
    const startedAt = Date.now();
    pluginLog.info('plugin_screen.mounted', { pluginId, screen });
    return (): void => {
      pluginLog.info('plugin_screen.unmounted', {
        pluginId,
        screen,
        visibleMs: Date.now() - startedAt,
      });
    };
  }, [pluginId, screen]);
}
