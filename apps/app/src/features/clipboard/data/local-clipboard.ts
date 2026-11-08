import * as Clipboard from 'expo-clipboard';
import type { DesktopClipboard } from '@smarteverything/domain';
import { isNative } from '../../../design/platform';
import { isClipboardRefused } from '../model/clipboard-read';

export interface LocalClipboard {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  watch(onChange: () => void): () => void;
}

export function localClipboard(bridge: DesktopClipboard | null): LocalClipboard {
  return {
    read: async (): Promise<string | null> => {
      if (bridge !== null) return bridge.readText();
      try {
        return await Clipboard.getStringAsync();
      } catch (error) {
        if (isClipboardRefused(error)) return null;
        throw error;
      }
    },
    write: async (text): Promise<void> => {
      if (bridge !== null) {
        await bridge.writeText(text);
        return;
      }
      await Clipboard.setStringAsync(text);
    },
    watch: (onChange): (() => void) => {
      if (bridge !== null) return bridge.onChange(onChange);
      if (!isNative()) return () => undefined;
      const subscription = Clipboard.addClipboardListener(onChange);
      return () => {
        subscription.remove();
      };
    },
  };
}
