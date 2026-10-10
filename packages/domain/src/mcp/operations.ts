import type { EndpointName } from '../api/endpoints';
import type { EndpointShape } from '../api/endpoint';
import type { McpToolArea } from './areas';

export const MCP_HUMAN_ONLY_OPERATIONS: Readonly<Partial<Record<EndpointName, string>>> = {
  status:
    'Public health check for clients that are not signed in; readSnapshot and session cover it.',
  claimPairing: 'A new phone exchanges its own pairing code; an assistant is never a phone.',
  startPairing: 'Creates a code that lets a new phone in; granting access stays with the person.',
  rotateOwnerToken:
    'Would hand the desktop’s own credential to the assistant and sign the desktop out.',
  createMcpToken: 'Creates a credential for an assistant; granting access stays with the person.',
  createApprovalCode: 'Approves an assistant’s access; consent stays with the person.',
  decideMcpConsent: 'Allows or denies an assistant; consent stays with the person.',
  createHealthSource:
    'A phone registers itself to upload Health Connect data with a token it keeps.',
  ingestHealth: 'Phone upload protocol (health source token); use log_health to add data.',
  readHealthOutbox: 'Phone delivery protocol (health source token) for writing to Health Connect.',
  ackHealthOutbox: 'Phone delivery protocol (health source token) for writing to Health Connect.',
  readBleWatch: 'The phone’s Bluetooth listener asks what to listen for.',
  reportPhone: 'A phone reports what it sees about itself; use read_phone to read it.',
  answerPhoneAction: 'A phone answers an action; use run_phone_action to act.',
  relayBleAdverts: 'The phone’s Bluetooth listener forwards raw radio adverts.',
  readPhoneWatches:
    'Hands a phone the keys it needs to connect to its watches; keys stay on phones.',
  reportWatchState: 'The phone connected to a watch reports what it sees.',
  answerWatchAction:
    'The phone connected to a watch answers an action; use run_watch_action to act.',
  saveWatchRecords:
    'The phone connected to a watch uploads what it read; use log_health to add data.',
  savePushTarget: 'A phone registers its own Firebase token.',
  removePushTarget: 'A phone forgets its own Firebase token.',
  offerCamera: 'Live video needs a WebRTC peer; use camera_pictures to see a camera.',
  talkCamera: 'Sends microphone audio to a camera speaker; only the person talks through cameras.',
  cameraStream: 'Live video over a WebSocket; use camera_pictures to see a camera.',
  cameraSnapshot: 'Returns a signed link for a browser; camera_pictures returns the image.',
  recordingLinks: 'Returns signed links for a browser; camera_pictures returns saved images.',
  connectAssistantApp:
    'Installs SmartEverything into Claude Code or Codex with a new credential; granting access stays with the person.',
  importGeminiKey:
    'Copies a credential between apps on the computer; the person does it in Settings.',
  setGeminiKey: 'Stores a credential for the voice assistant; the person enters it in Settings.',
  removeGeminiKey: 'Removes the voice assistant’s credential; the person does it in Settings.',
  importOpenRouterKey:
    'Copies a credential between apps on the computer; the person does it in Settings.',
  setOpenRouterKey: 'Stores the OpenRouter credential; the person enters it in Settings.',
  removeOpenRouterKey: 'Removes the OpenRouter credential; the person does it in Settings.',
  disconnectAssistantApp:
    'Removes an app’s SmartEverything credential; the person does it on the desktop.',
  declineOutreach: 'A person declines a ringing AI call on their own device.',
  updateReachSettings:
    'The person’s own rules for how the AI may reach them; only they change them in Settings.',
  assistantAttachmentLinks:
    'Returns signed links for a browser; read_chats view attachment returns the file.',
  updateComputerScopes:
    'Decides what SmartEverything and the AI may do on a computer; only the person changes it in the app.',
  captureComputer:
    'Returns a raw screenshot for the app; take_screenshot gives the AI the picture as a chat attachment.',
  installPlugin: 'Adds code that runs on this computer; the person adds plugins in Settings.',
  removePlugin: 'Removes a plugin with its data and keys; the person does it in Settings.',
};

export const MCP_CONFIRMED_OPERATIONS: ReadonlySet<EndpointName> = new Set<EndpointName>([
  'removeClient',
  'clearPushAccount',
  'removeRoom',
  'removeEvent',
  'removeRecording',
  'removeIrRemote',
  'removeIrCode',
  'removeScene',
  'removeAutomation',
  'revokeHealthSource',
  'revokeMcpToken',
  'revokeOAuthGrant',
  'deleteProfile',
  'removeLocalDevice',
  'deleteHealthEntry',
  'deleteFood',
  'removeTalkChannel',
  'removeTalkMessage',
  'signalComputerProcess',
  'closeComputerApp',
]);

const AREA_BY_PREFIX: readonly (readonly [string, McpToolArea])[] = [
  ['/api/health/entries', 'health'],
  ['/api/foods', 'nutrition'],
  ['/api/health', 'health'],
  ['/api/settings/fitness', 'health'],
  ['/api/body-readings', 'people'],
  ['/api/profiles', 'people'],
  ['/api/session/profile', 'people'],
  ['/api/local-devices', 'devices'],
  ['/api/ble', 'devices'],
  ['/api/watches/days', 'health'],
  ['/api/watches', 'devices'],
  ['/api/phones', 'devices'],
  ['/api/nodes', 'devices'],
  ['/api/settings', 'settings'],
  ['/api/layouts', 'settings'],
  ['/api/push-targets', 'settings'],
  ['/api/rooms', 'home'],
  ['/api/weather', 'home'],
  ['/api/places', 'home'],
  ['/api/providers', 'home'],
  ['/api/devices', 'devices'],
  ['/api/computers', 'computers'],
  ['/api/device-state', 'devices'],
  ['/api/ir-', 'devices'],
  ['/api/commands', 'control'],
  ['/api/history', 'history'],
  ['/api/events', 'history'],
  ['/api/cameras', 'cameras'],
  ['/api/recordings', 'cameras'],
  ['/api/talk', 'talk'],
  ['/api/assistant', 'assistant'],
  ['/api/ai/chats', 'assistant'],
  ['/api/ai/usage', 'assistant'],
  ['/api/ai/budget', 'assistant'],
  ['/api/ai/engines', 'assistant'],
  ['/api/ai', 'assistant'],
  ['/api/scenes', 'automations'],
  ['/api/automations', 'automations'],
  ['/api/scheduled', 'automations'],
  ['/api/signals', 'automations'],
  ['/api/reach', 'assistant'],
  ['/api/plugins', 'plugins'],
];

export function mcpOperationArea(endpoint: Pick<EndpointShape, 'path'>): McpToolArea {
  const found = AREA_BY_PREFIX.find(([prefix]) => endpoint.path.startsWith(prefix));
  return found === undefined ? 'system' : found[1];
}

export function isHumanOnlyOperation(name: EndpointName): boolean {
  return MCP_HUMAN_ONLY_OPERATIONS[name] !== undefined;
}
