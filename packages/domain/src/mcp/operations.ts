import type { EndpointName } from '../api/endpoints';
import type { EndpointShape } from '../api/endpoint';
import { SELF_UPDATE_RECOVERY_PATH } from '../self-update';
import { HUB_UPDATE_SOURCE_PATH } from '../hub-update-source';
import type { McpToolArea } from './areas';
import { MCP_OPERATION_TOOLS, type McpCoreToolName } from './names';

export * from './operation-traits';

const RETIRED_EXTERNAL_CHAT = 'External Claude and Codex chat controls have been removed.';

export const MCP_UNAVAILABLE_OPERATIONS: Readonly<Partial<Record<EndpointName, string>>> = {
  startClaudeSession: RETIRED_EXTERNAL_CHAT,
  startComputerClaudeSession: RETIRED_EXTERNAL_CHAT,
  controlClaudeSession: RETIRED_EXTERNAL_CHAT,
  controlComputerClaudeSession: RETIRED_EXTERNAL_CHAT,
  answerClaudePrompt: RETIRED_EXTERNAL_CHAT,
  answerComputerClaudePrompt: RETIRED_EXTERNAL_CHAT,
  startClaudeCliSession: RETIRED_EXTERNAL_CHAT,
  controlClaudeCliSession: RETIRED_EXTERNAL_CHAT,
  answerClaudeCliPrompt: RETIRED_EXTERNAL_CHAT,
  registerClaudeController: RETIRED_EXTERNAL_CHAT,
  registerComputerClaudeController: RETIRED_EXTERNAL_CHAT,
  removeClaudeController: RETIRED_EXTERNAL_CHAT,
  removeComputerClaudeController: RETIRED_EXTERNAL_CHAT,
  listClaudeSessions: RETIRED_EXTERNAL_CHAT,
  readClaudeSession: RETIRED_EXTERNAL_CHAT,
  listClaudeThread: RETIRED_EXTERNAL_CHAT,
  listClaudePrompts: RETIRED_EXTERNAL_CHAT,
  installClaudeLink: RETIRED_EXTERNAL_CHAT,
  listClaudeCliSessions: RETIRED_EXTERNAL_CHAT,
  readClaudeCliSession: RETIRED_EXTERNAL_CHAT,
  readClaudeCliHistory: RETIRED_EXTERNAL_CHAT,
  readClaudeCliOperation: RETIRED_EXTERNAL_CHAT,
  readClaudeCliPrompts: RETIRED_EXTERNAL_CHAT,
  readComputerClaudeOperation: RETIRED_EXTERNAL_CHAT,
  listComputerClaudeSessions: RETIRED_EXTERNAL_CHAT,
  readComputerClaudeSession: RETIRED_EXTERNAL_CHAT,
  listComputerClaudeThread: RETIRED_EXTERNAL_CHAT,
  listComputerClaudePrompts: RETIRED_EXTERNAL_CHAT,
  installComputerClaudeLink: RETIRED_EXTERNAL_CHAT,
  listComputerClaudeTools: RETIRED_EXTERNAL_CHAT,
  callComputerClaudeTool: RETIRED_EXTERNAL_CHAT,
  postAssistantHelperArtifacts: 'Use chat_post with shareWithParent from the calling helper.',
  executeComputerRuntime: RETIRED_EXTERNAL_CHAT,
  readComputerRuntimeReceipt: RETIRED_EXTERNAL_CHAT,
};

export const MCP_HUMAN_ONLY_OPERATIONS: Readonly<Partial<Record<EndpointName, string>>> = {
  startHubUpdateSource: 'Requires explicit approval of the exact Git update in the owner app.',
  saveHubUpdateSource: 'Requires the owner to confirm creating a local recovery branch in the app.',
  readAssistantVoiceSample:
    'Audio audition is an explicit person-operated Play control in voice settings.',
  updateComputerNativeMcpPolicy:
    'Grants native computer/runtime tool access; only a person changes this policy in the app.',
  listAiChatHarnessCommands:
    'Discovers the person’s native slash-command surface; AI tools use their own live capability catalogue.',
  controlAiHarnessSubscription:
    'Subscription sign-in grants provider account access and reveals short-lived authorization URLs/codes; only a person manages it in computer settings.',
  executeAiChatHarnessCommand:
    'Native slash commands are direct human controls; AI tools use the underlying capabilities instead.',
  readImageOperation:
    'Image receipt status belongs to the person in the app; the UI automatically displays completion and AI must not wait, check or poll it.',
  listImageOperations:
    'Image receipt history belongs to the person in the app; the UI automatically displays completion and AI must not wait, check or poll it.',
  pairComputerNode:
    'Issues a computer-service credential grant; only a person pairs a computer in the app.',
  claimComputerNode: 'Consumes an access-granting pairing code on the computer being paired.',
  installComputerClaudeLink:
    'Installs a trusted native Claude plugin and provisions its computer-scoped access; only a person does that in the app.',
  registerComputerClaudeController:
    'Registers a trusted native controller session; the person opens and sends its one-time registration prompt.',

  hubIdentity:
    'Public untrusted discovery probe for app transport bootstrap; hubConnection provides authenticated metadata.',
  status:
    'Public health check for clients that are not signed in; readSnapshot and session cover it.',
  unlockShare:
    'A visitor opens a share link with its password in a browser; the link and password stay with the person who shared them.',
  claimPairing: 'A new phone exchanges its own pairing code; an assistant is never a phone.',
  proveHub: 'A new phone checks the hub it is pairing with; an assistant is never a phone.',
  startPairing: 'Creates a code that lets a new phone in; granting access stays with the person.',
  rotateOwnerToken:
    'Would hand the desktop’s own credential to the assistant and sign the desktop out.',
  createMcpToken: 'Creates a credential for an assistant; granting access stays with the person.',
  createApprovalCode: 'Approves an assistant’s access; consent stays with the person.',
  editAiChatMessage:
    'Changes the words of a message the person wrote; only the person edits what they said.',
  decideMcpConsent: 'Allows or denies an assistant; consent stays with the person.',
  createHealthSource:
    'A phone registers itself to upload Health Connect data with its own pairing.',
  ingestHealth: 'Phone upload protocol (the phone’s pairing); use health_edit to add data.',
  readHealthOutbox: 'Phone delivery protocol (the phone’s pairing) for writing to Health Connect.',
  ackHealthOutbox: 'Phone delivery protocol (the phone’s pairing) for writing to Health Connect.',
  readBleWatch: 'The phone’s Bluetooth listener asks what to listen for.',
  reportClientPerf:
    'An app reports its own performance samples; there is nothing for an assistant to do with it.',
  ingestRuntimeLogs:
    'An app or device ships its own redacted log records; assistants read them with the log tool.',
  ingestDesktopRuntimeLogs:
    'The paired desktop ships its own process logs; assistants read them with the log tool.',
  reportRuntimeLogGap:
    'An app reports records it had to drop; nothing for an assistant to do with it.',
  dropRuntimeLogs: 'Deletes stored log records; only a person in the app does that.',
  updateAiRepairSettings: 'Only the owner in the app can enable automatic AI repair.',
  watchListeningLevel:
    'A live loudness meter for the person looking at the Listening page; assistants read listening_read.',
  watchWakeTest:
    'A live view for the person testing the wake word; assistants read listening_read and change the name and aliases with settings_edit (action assistant).',
  readPhoneListeningConfig:
    'The phone’s own ear asks how to listen; assistants read and change it with listening_read and listening_edit.',
  claimPhoneWake:
    'The phone’s own ear claims a wake it heard; assistants have no ears to claim with.',
  reportPhoneListening:
    'The phone’s own ear uploads speech and its state; assistants read listening_read and transcript_read.',
  reportPhone: 'A phone reports what it sees about itself; use phone_read to read it.',
  answerPhoneAction: 'A phone answers an action; use phone_control to act.',
  answerAppView: 'An app answers a request to show something.',
  uploadPhoneIcon: 'A phone uploads the icon pictures of its apps for the app to show.',
  uploadHomeMapScan: 'A person uploads the scan file in the app; assistants edit its transform.',
  homeMapScanLink:
    'Returns a signed link the app draws the scan from; assistants edit its transform.',
  readPhoneIcon: 'App icon pictures are shown by the app; phone_read detail lists the apps.',
  relayBleAdverts: 'The phone’s Bluetooth listener forwards raw radio adverts.',
  readPhoneWatches:
    'Hands a phone the keys it needs to connect to its watches; keys stay on phones.',
  readAiSpeech:
    'A phone fetches speech the AI sent it by push; use speak to make the AI say something.',
  readWatchData:
    'The phone connected to a watch fetches what it sends the watch; use weather_read and person_read for the same facts.',
  reportWatchState: 'The phone connected to a watch reports what it sees.',
  takeOverWatchBridge:
    'Chooses which phone’s Bluetooth connects to a watch; only the person on that phone decides.',
  answerWatchAction: 'The phone connected to a watch answers an action; use watch_control to act.',
  saveWatchRecords:
    'The phone connected to a watch uploads what it read; use health_edit to add data.',
  readPhoneTreadmills:
    'Hands a phone the Bluetooth plan for the treadmills it may hold; the link stays on phones.',
  reportTreadmillFrames: 'The phone holding a treadmill reports the frames it received.',
  answerTreadmillAction:
    'The phone holding a treadmill answers a belt command; use device_control to command the belt.',
  readPhoneBrushes:
    'Hands a phone the Bluetooth plan for the toothbrushes it may hold; the link stays on phones.',
  reportBrushFrames: 'The phone holding a toothbrush reports the frames it received.',
  answerBrushAction:
    'The phone holding a toothbrush answers a command; use device_control to change the mode or feedback switches.',
  readPhoneBottles:
    'Hands a phone the Bluetooth plan for the water bottles it syncs; the link stays on phones.',
  uploadBottleSync:
    'The phone that syncs a water bottle uploads what the cap answered; readBottle returns the data.',
  answerBottleAction:
    'The phone that syncs a water bottle answers an action; actBottle starts the action.',
  addBottle: 'A bottle is found by a phone scanning Bluetooth; the person adds it in the app.',
  startBottleUv:
    'UV-C needs a person at the bottle holding the Clean button; an assistant may stop a clean with actBottle uv_stop.',
  savePushTarget: 'A phone registers its own Firebase token.',
  removePushTarget: 'A phone forgets its own Firebase token.',
  offerCamera: 'Live video needs a WebRTC peer; use camera_read to see a camera.',
  talkCamera: 'Sends microphone audio to a camera speaker; only the person talks through cameras.',
  cameraStream: 'Live video over a WebSocket; use camera_read to see a camera.',
  openVacuumVideo: 'Live robot video needs a WebRTC peer and the video password the person types.',
  cameraSnapshot: 'Returns a signed link for a browser; camera_read returns the image.',
  recordingLinks: 'Returns signed links for a browser; camera_read returns saved images.',
  importGeminiKey:
    'Copies a credential between apps on the computer; the person does it in Settings.',
  setGeminiKey: 'Stores a credential for the voice assistant; the person enters it in Settings.',
  removeGeminiKey: 'Removes the voice assistant’s credential; the person does it in Settings.',
  setOpenRouterKey: 'Stores the OpenRouter credential; the person enters it in Settings.',
  removeOpenRouterKey: 'Removes the OpenRouter credential; the person does it in Settings.',
  setDeepSeekKey: 'Stores the DeepSeek credential; the person enters it in Settings.',
  removeDeepSeekKey: 'Removes the DeepSeek credential; the person does it in Settings.',
  declineOutreach: 'A person declines a ringing AI call on their own device.',
  updateReachSettings:
    'The person’s own rules for how the AI may reach them; only they change them in Settings.',
  assistantAttachmentLinks:
    'Returns signed links for a browser; chat_read view attachment returns the file.',
  updateComputerScopes:
    'Decides what SmartEverything and the AI may do on a computer; only the person changes it in the app.',
  captureComputer:
    'Returns a raw screenshot for the app; see gives the AI the picture as a chat attachment.',
  installPlugin: 'Adds code that runs on this computer; the person adds plugins in Settings.',
  removePlugin: 'Removes a plugin with its data and keys; the person does it in Settings.',
  setPluginPerson:
    'Decides who may act through a plugin, including as the owner; only the person decides it in Settings.',
  removePluginPerson:
    'Decides who may act through a plugin; only the person decides it in Settings.',
  readPluginOptions:
    'Fills the pickers of a plugin’s settings in the app; the AI reads the same things through the plugin’s own tools.',
  readDeveloperDevice:
    'Developer debug standing of a paired device; read in the app’s Developer page.',
  setDeveloperDevice:
    'Makes a paired device a developer device; only the developer turns it on in the app’s Developer page.',
  saveWatchCaptures: 'Raw watch file bytes are sent by the developer phone during a watch sync.',
  readWatchCaptures:
    'Lists raw watch debug files for parser development; shown in the app’s Developer page.',
  clearWatchCaptures:
    'Deletes the raw watch debug files; only the developer clears them in the app’s Developer page.',
};

const MCP_ADMIN_OPERATIONS: Readonly<Partial<Record<EndpointName, string>>> = {
  updateAssistantSettings:
    'Changes the assistant’s instructions, models and limits for everyone; only a person in the app does that.',
  updateAiBudget: 'Sets what the AI may spend; only a person in the app does that.',
  updateAiEngineDefault:
    'Chooses the models every new chat starts with; only a person in the app does that.',
  setAiModelPrice:
    'Overrides what a model costs, which feeds the budget; only a person in the app does that.',
  updateMcpTools: 'Decides which tools an AI may use; only a person in the app does that.',
  updatePlugin:
    'Configures plugins, their tools and who they trust; only a person in the app does that.',
  restartPlugin:
    'Restarts a plugin, which can drop what it is doing; only a person in the app does that.',
  postPluginMessage:
    'Writes into a plugin’s inbox as one of its people, which would lift a request’s trust; only a person in the app does that.',
  createProfile: 'Adds a person to the home; only a person in the app manages people.',
  updateProfile: 'Changes a person’s profile; only a person in the app manages people.',
  deleteProfile: 'Removes a person with their data; only a person in the app manages people.',
  selectProfile: 'Switches whose data the app shows; only a person in the app does that.',
  updateClient: 'Changes a paired app or computer; only a person in the app manages pairing.',
  removeClient: 'Unpairs an app or computer; only a person in the app manages pairing.',
  changePersonAccess:
    'Changes what a person may do and until when; only a person in the app manages access.',
  revokePerson:
    'Ends a person’s access now and unpairs every device; only a person in the app manages access.',
  decideAccessRequest: 'Widens what a person may do; only a person in the app manages access.',
  revokeMcpToken: 'Cuts an assistant’s access; only a person in the app manages access.',
  revokeOAuthGrant: 'Cuts an assistant’s access; only a person in the app manages access.',
  revokeHealthSource: 'Cuts a phone’s health sync; only a person in the app manages access.',
  setPushAccount: 'Stores the push credentials; only a person in the app handles credentials.',
  clearPushAccount: 'Removes the push credentials; only a person in the app handles credentials.',
  setPublicUrl:
    'Changes how the server is reached from outside; only a person in the app does that.',
  verifyPublicUrl:
    'Makes the server contact its public address; only a person in the app does that.',
  updateNetwork:
    'Changes the server’s network and relay settings; only a person in the app does that.',
  setUpSmartThings:
    'Links a provider account with its credentials; only a person in the app does that.',
  authorizeSmartThings:
    'Links a provider account with its credentials; only a person in the app does that.',
  addLocalDevice:
    'Adds a device or attaches Bluetooth observation with its account key; credential access stays with the owner in the app.',
  removeLocalDevice: 'Removes a device on the local network; only a person in the app does that.',
  forgetBottle:
    'Removes a water bottle with its whole reading, cleaning and battery history; only a person in the app does that.',
  sendAssistantMessage:
    'Writes a message in the person’s own words and starts a turn as them; a plugin’s request uses chat_send.',
  sendAiChatMessage:
    'Writes a message in the person’s own words and starts a turn as them; a plugin’s request uses chat_send.',
  retryAiChatMessage:
    'Re-runs the AI on a message the person wrote and replaces its reply; only the owner’s own AI may, never a plugin’s request.',
  controlClaudeSession:
    'Changes what a Claude session may do (modes, interrupts, sends); only a person in the app does that.',
  startClaudeSession:
    'Starts a Claude session on the computer; only a person in the app does that.',
  answerClaudePrompt:
    'Approves or denies what a Claude session asks to do; only a person in the app does that.',
  installClaudeLink:
    'Installs the Claude link on the computer; only a person in the app does that.',
  removeClaudeLink: 'Removes the Claude link; only a person in the app does that.',
  registerClaudeController:
    'Registers who may control Claude sessions; only a person in the app does that.',
  removeClaudeController:
    'Removes who may control Claude sessions; only a person in the app does that.',
};

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
  ['/api/treadmills', 'devices'],
  ['/api/toothbrushes', 'devices'],
  ['/api/bottles', 'devices'],
  ['/api/phones', 'devices'],
  ['/api/phone-icons', 'devices'],
  ['/api/nodes', 'devices'],
  ['/api/settings', 'settings'],
  ['/api/layouts', 'settings'],
  ['/api/clipboard', 'settings'],
  ['/api/push-targets', 'settings'],
  ['/api/rooms', 'home'],
  ['/api/home-map', 'home'],
  ['/api/weather', 'home'],
  ['/api/exchange-rates', 'settings'],
  ['/api/places', 'home'],
  ['/api/providers', 'home'],
  ['/api/devices', 'devices'],
  ['/api/device-', 'devices'],
  ['/api/models', 'devices'],
  ['/api/model-', 'devices'],
  ['/api/listening', 'assistant'],
  ['/api/televisions', 'devices'],
  ['/api/vacuums', 'devices'],
  ['/api/computers', 'computers'],
  ['/api/ir-', 'devices'],
  ['/api/commands', 'control'],
  ['/api/history', 'history'],
  ['/api/events', 'history'],
  ['/api/cameras', 'cameras'],
  ['/api/planner', 'planner'],
  ['/api/google', 'planner'],
  ['/api/camera-transcripts', 'cameras'],
  ['/api/transcript', 'cameras'],
  ['/api/recordings', 'cameras'],
  ['/api/talk', 'talk'],
  ['/api/assistant', 'assistant'],
  ['/api/ai/chats', 'assistant'],
  ['/api/ai/usage', 'assistant'],
  ['/api/ai/budget', 'assistant'],
  ['/api/ai/engines', 'assistant'],
  ['/api/ai-repair', 'system'],
  ['/api/ai', 'assistant'],
  ['/api/app-view', 'assistant'],
  [SELF_UPDATE_RECOVERY_PATH, 'system'],
  [HUB_UPDATE_SOURCE_PATH, 'system'],
  ['/api/runtime-logs', 'system'],
  ['/api/scenes', 'automations'],
  ['/api/automations', 'automations'],
  ['/api/automation-', 'automations'],
  ['/api/scheduled', 'automations'],
  ['/api/signals', 'automations'],
  ['/api/reach', 'assistant'],
  ['/api/claude', 'assistant'],
  ['/api/plugins', 'plugins'],
  ['/api/drive', 'drive'],
  ['/s/', 'drive'],
];

export function mcpOperationArea(endpoint: Pick<EndpointShape, 'path'>): McpToolArea {
  return AREA_BY_PREFIX.find(([prefix]) => endpoint.path.startsWith(prefix))?.[1] ?? 'system';
}

export function isHumanOnlyOperation(name: EndpointName): boolean {
  return MCP_HUMAN_ONLY_OPERATIONS[name] !== undefined;
}

const MCP_CORE_OPERATIONS: Readonly<Partial<Record<McpCoreToolName, EndpointName>>> = {
  list_device_groups: 'listDeviceGroups',
  set_ai_defaults: 'updateAiEngineDefault',
  computer_read: 'readComputer',
  get_computer_audio: 'readComputerAudio',
  get_computer_displays: 'readComputerDisplays',
  get_computer_system: 'readComputerSystem',
  get_computer_windows: 'readComputerWindows',
  get_computer_tiling: 'readComputerTiling',
  get_computer_services: 'readComputerServices',
  process_read: 'listComputerProcesses',
  process_control: 'signalComputerProcess',
  computer_audio_set: 'changeComputerAudio',
  computer_display_set: 'changeComputerDisplay',
  computer_system_set: 'changeComputerSystem',
  computer_use: 'inputComputer',
  focus_window: 'changeComputerWindow',
  minimise_window: 'changeComputerWindow',
  close_window: 'changeComputerWindow',
  file_edit: 'writeComputerFiles',
};

const OPERATION_OF_TOOL: ReadonlyMap<string, EndpointName> = new Map<string, EndpointName>([
  ...MCP_OPERATION_TOOLS.map(([tool, operation]): [string, EndpointName] => [tool, operation]),
  ...Object.entries(MCP_CORE_OPERATIONS),
]);

export function mcpToolOperation(tool: string): EndpointName | undefined {
  return OPERATION_OF_TOOL.get(tool);
}

export function isAdminOperation(name: EndpointName): boolean {
  return MCP_ADMIN_OPERATIONS[name] !== undefined;
}

export function pluginTurnOperationReason(name: EndpointName): string | null {
  return MCP_HUMAN_ONLY_OPERATIONS[name] ?? MCP_ADMIN_OPERATIONS[name] ?? null;
}

export function mcpToolLine(description: string): string {
  return description.replace(/(?<=\.)\s[\s\S]*$/u, '').replace(/\.$/u, '');
}
