import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Logger, background } from '@smarteverything/logging';
import { readSharedClipboard, writeSharedClipboard } from '../../../api/shared-clipboard';
import { isNative } from '../../../design/platform';
import { onLocalCopy } from '../../../components/local-copies';
import { PREFS, usePref } from '../../../store/prefs';
import { useSyncStatus } from '../../../store/selectors';
import { ClipboardSync } from '../model/clipboard-sync';
import { attachSharedClipReceiver } from './clipboard-bridge';

const log = new Logger('app.clipboard');

function newSync(): ClipboardSync {
  return new ClipboardSync(
    {
      readLocal: () => Clipboard.getStringAsync(),
      writeLocal: async (text): Promise<void> => {
        await Clipboard.setStringAsync(text);
      },
      readRemote: readSharedClipboard,
      sendRemote: writeSharedClipboard,
    },
    log,
  );
}

function watchLocal(sync: ClipboardSync): () => void {
  const focus = (): void => {
    background(sync.foreground(), 'clipboard.foreground_failed');
  };
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') focus();
  });
  const copies = onLocalCopy((text) => {
    background(sync.copied(text), 'clipboard.copy_failed');
  });
  const native = isNative()
    ? Clipboard.addClipboardListener(() => {
        background(sync.localChanged(), 'clipboard.change_failed');
      })
    : null;
  if (!isNative()) window.addEventListener('focus', focus);
  return (): void => {
    app.remove();
    copies();
    native?.remove();
    if (!isNative()) window.removeEventListener('focus', focus);
  };
}

export function ClipboardSyncHost(): null {
  const pref = usePref(PREFS.sharedClipboard);
  const live = useSyncStatus().status === 'live';
  const enabled = live && pref.status === 'ready' && pref.value.enabled;
  useEffect(() => {
    if (!enabled) return undefined;
    const sync = newSync();
    const stopWatching = watchLocal(sync);
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
