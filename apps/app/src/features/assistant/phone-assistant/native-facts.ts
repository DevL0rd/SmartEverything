import type { PhoneAssistantNative } from './phone-native';

export interface NativeFacts {
  readonly assistant: boolean | null;
  readonly overlay: boolean | null;
  readonly microphone: boolean | null;
  readonly battery: boolean | null;
}

export const UNKNOWN_FACTS: NativeFacts = {
  assistant: null,
  overlay: null,
  microphone: null,
  battery: null,
};

export async function readNativeFacts(port: PhoneAssistantNative): Promise<NativeFacts> {
  return {
    assistant: port.assistantChosen(),
    overlay: port.overlayAllowed(),
    microphone: await port.microphoneAllowed(),
    battery: port.batteryUnrestricted(),
  };
}
