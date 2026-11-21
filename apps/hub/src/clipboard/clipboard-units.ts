import { CLIENT_PREFS } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { ClipboardCaller } from './shared-clipboard';

export const SHARED_CLIPBOARD_PREF_UNIT = storeUnit((store, caller: ClipboardCaller) =>
  store.personal.pref(CLIENT_PREFS.shared_clipboard, caller),
);
