export const PLATFORM_FORKS: Readonly<Record<string, string>> = {
  'src/components/charts/use-step-keys.ts':
    'only the browser has the DOM elements the chart steps keys are bound to',
  'src/design/platform.ts': 'tells the browser, the desktop window and the phone apart for layout',
  'src/developer/watch-capture.ts':
    'only Android has the watch capture saving the developer toggle starts and stops',
  'src/features/assistant/chats/chat-panel-state.ts':
    'only Android has a hardware back button to close the chat panel',
  'src/features/assistant/chats/draft-engine-picker.tsx':
    'phones and desktop windows dismiss the soft keyboard when the picker opens, the browser keeps its own focus',
  'src/features/assistant/chats/model-menu-anchor.ts':
    'moves browser focus back to the model menu trigger on the web only',
  'src/features/assistant/components/markdown/code-card.tsx':
    'only Android needs the gesture handler so a horizontal scroll inside a code card wins over the sheet drag',
  'src/features/assistant/components/markdown/table-card.tsx':
    'only Android needs the gesture handler so a horizontal scroll inside a table card wins over the sheet drag',
  'src/features/assistant/phone-assistant/phone-native.ts':
    'only Android has the runtime microphone permission the phone assistant checks',
  'src/features/clock/alarm/step-access.ts':
    'only an Android phone rings planner alarms and asks for the permissions they need',
  'src/features/clock/ring/ring-device.ts':
    'only an Android phone rings planner alarms and timers itself',
  'src/features/connections/google/link-flow-consent.ts':
    'only Android shows the consent text of the phone Google link flow',
  'src/features/devices/television/reason-slot.tsx':
    'only iOS needs the television note announced by hand; the live region covers the other platforms',
  'src/features/phone/phone-permissions.ts':
    'Android versions decide which permissions the phone asks for',
  'src/features/phone/this-phone-rows.tsx':
    'the Samsung settings shortcut exists only on Samsung phones',
  'src/features/photos/organise/locked/biometric.ts':
    'only Android offers the fingerprint unlock of the locked photos',
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
