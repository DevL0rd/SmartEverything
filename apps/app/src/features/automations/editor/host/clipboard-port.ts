import * as Clipboard from 'expo-clipboard';

export interface ClipboardPort {
  readonly read: () => Promise<string>;
  readonly write: (text: string) => Promise<void>;
}

export const deviceClipboard: ClipboardPort = {
  read: () => Clipboard.getStringAsync(),
  write: async (text) => {
    await Clipboard.setStringAsync(text);
  },
};
