import { describe, expect, it } from 'vitest';
import { readNativeFacts } from './native-facts';
import type { PhoneAssistantNative } from './phone-native';

function port(over: Partial<PhoneAssistantNative> = {}): PhoneAssistantNative {
  const open = (): Promise<void> => Promise.resolve();
  return {
    assistantChosen: () => true,
    overlayAllowed: () => false,
    batteryUnrestricted: () => true,
    microphoneAllowed: () => Promise.resolve(false),
    openAssistantSettings: open,
    openOverlaySettings: open,
    openBatterySettings: open,
    openSideKeySettings: null,
    ...over,
  };
}

describe('reading what the phone says', () => {
  it('collects the four facts the phone can report', async () => {
    expect(await readNativeFacts(port())).toEqual({
      assistant: true,
      overlay: false,
      microphone: false,
      battery: true,
    });
  });

  it('keeps a fact unknown when the app build cannot report it', async () => {
    const facts = await readNativeFacts(
      port({
        assistantChosen: () => null,
        overlayAllowed: () => null,
        batteryUnrestricted: () => null,
        microphoneAllowed: () => Promise.resolve(null),
      }),
    );
    expect(facts).toEqual({ assistant: null, overlay: null, microphone: null, battery: null });
  });
});
