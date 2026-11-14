import type { WebContents } from 'electron';

export function onDocumentReplaced(contents: WebContents, listener: () => void): void {
  contents.on('did-navigate', () => {
    listener();
  });
}
