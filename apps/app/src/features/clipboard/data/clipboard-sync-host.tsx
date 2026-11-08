import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { readSharedClipboard, writeSharedClipboard } from '../../../api/shared-clipboard';
import { desktopBridge, isNative } from '../../../design/platform';
import { onLocalCopy } from '../../../components/local-copies';
import { PREFS, usePref } from '../../../store/prefs';
import { useSyncStatus } from '../../../store/selectors';
import { ClipboardSync } from '../model/clipboard-sync';
import { attachSharedClipReceiver } from './clipboard-bridge';
import { localClipboard, type LocalClipboard } from './local-clipboard';

const log = new Logger('app.clipboard');

function newSync(clipboard: LocalClipboard): ClipboardSync {
  return new ClipboardSync(
    {
      readLocal: () => clipboard.read(),
      writeLocal: (text) => clipboard.write(text),
      readRemote: readSharedClipboard,
      sendRemote: writeSharedClipboard,
    },
    log,
  );
}

function watchLocal(sync: ClipboardSync, clipboard: LocalClipboard): () => void {
  const focus = (): void => {
    background(sync.foreground(), 'clipboard.foreground_failed');
  };
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') focus();
  });
  const copies = onLocalCopy((text) => {
    background(sync.copied(text), 'clipboard.copy_failed');
  });
  const changed = clipboard.watch(() => {
    background(sync.localChanged(), 'clipboard.change_failed');
  });
  if (!isNative()) window.addEventListener('focus', focus);
  return (): void => {
    app.remove();
    copies();
    changed();
    if (!isNative()) window.removeEventListener('focus', focus);
  };
}

export function ClipboardSyncHost(): null {
  const pref = usePref(PREFS.sharedClipboard);
  const live = useSyncStatus().status === 'live';
  const enabled = live && pref.status === 'ready' && pref.value.enabled;
  useEffect(() => {
    if (!enabled) return undefined;
    const clipboard = localClipboard(desktopBridge()?.clipboard ?? null);
    const sync = newSync(clipboard);
    const stopWatching = watchLocal(sync, clipboard);
    const detach = attachSharedClipReceiver((clip) => {
      background(sync.received(clip), 'clipboard.receive_failed');
    });
    background(sync.foreground(), 'clipboard.foreground_failed');
    return (): void => {
      stopWatching();
      detach();
    };
  }, [enabled]);
  return null;
}
