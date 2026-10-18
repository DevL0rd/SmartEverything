import { notifyFailure } from '../../../components/toast-store';
import { setLocalPref } from '../../../store/local-prefs';
import { allowMicrophone } from '../../phone';
import { phoneEar } from '../phone-ear/phone-ear-live';
import { phoneAssistantNative } from './phone-native';
import { refreshSetupFacts } from './setup-facts';
import type { SetupActionKind } from './setup-model';

async function openSideKey(): Promise<void> {
  await phoneAssistantNative.openSideKeySettings?.();
}

async function askMicrophone(): Promise<void> {
  await allowMicrophone();
  await refreshSetupFacts();
  await phoneEar.ensure();
}

const HANDLERS: Readonly<Record<SetupActionKind, () => unknown>> = {
  open_assistant_settings: () => phoneAssistantNative.openAssistantSettings(),
  open_side_key_settings: openSideKey,
  confirm_side_key: () => {
    setLocalPref('sideKeyAssistant', true);
  },
  undo_side_key: () => {
    setLocalPref('sideKeyAssistant', false);
  },
  allow_microphone: askMicrophone,
  open_overlay_settings: () => phoneAssistantNative.openOverlaySettings(),
  open_battery_settings: () => phoneAssistantNative.openBatterySettings(),
};

export function runSetupAction(kind: SetupActionKind): void {
  Promise.resolve().then(HANDLERS[kind]).catch(notifyFailure('The settings did not open'));
}
