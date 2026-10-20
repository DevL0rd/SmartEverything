export const PLATFORM_FORKS: Readonly<Record<string, string>> = {
  'src/api/client-failures.ts': 'reports which platform a client failure came from',
  'src/design/platform.ts': 'tells the browser, the desktop window and the phone apart for layout',
  'src/features/assistant/chats/chat-panel-state.ts':
    'only Android has a hardware back button to close the chat panel',
  'src/features/assistant/chats/model-menu-anchor.ts':
    'moves browser focus back to the model menu trigger on the web only',
  'src/features/assistant/phone-assistant/phone-native.ts':
    'only Android has the runtime microphone permission the phone assistant checks',
  'src/features/devices/television/reason-slot.tsx':
    'only iOS needs the television note announced by hand; the live region covers the other platforms',
  'src/features/phone/phone-permissions.ts':
    'Android versions decide which permissions the phone asks for',
  'src/features/phone/this-phone-rows.tsx':
    'the Samsung settings shortcut exists only on Samsung phones',
  'src/features/watches/watch-link.ts': 'Android versions decide how the watch is linked',
  'src/platform/browser-focus.ts': 'restores browser focus on the web only',
  'src/plugins/larq/data/bluetooth-permission.ts':
    'Android versions decide which Bluetooth permissions the water bottle link asks for',
  'src/plugins/toothbrush/data/bluetooth-permission.ts':
    'Android versions decide which Bluetooth permissions and whether location must be on for the toothbrush link',
  'src/plugins/treadmill/data/bluetooth-permission.ts':
    'Android versions decide which Bluetooth permissions the treadmill link asks for',
};

export const PLATFORM_FILES_WITHOUT_BASE: Readonly<Record<string, string>> = {
  'src/features/cameras/player/mse-relay.web.ts':
    'the browser is the only runtime that has MediaSource, and only web files import it',
};
