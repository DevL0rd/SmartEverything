import type { EndpointName } from '../api/endpoints';
import type { EndpointShape } from '../api/endpoint';
import type { McpToolArea } from './areas';
import { MCP_OPERATION_TOOLS, type McpCoreToolName } from './names';

const STANDALONE_START =
  'Legacy standalone start is retired; use startClaudeCliSession for an owned actual CLI turn.';
const UNOWNED_SESSION =
  'Legacy session IDs have no managed ownership; use controlClaudeCliSession with the owned chat, computer, session and job.';
const UNBOUND_PROMPT =
  'Legacy prompts have no managed chat binding; use answerClaudeCliPrompt for the exact owned current CLI request.';
const CONTROLLER_REGISTRATION =
  'Desktop controller registration is replaced by owned CLI sessions and native provider execution.';
const CONTROLLER_REMOVAL =
  'Desktop controller management is retained only for legacy app compatibility.';

export const MCP_UNAVAILABLE_OPERATIONS: Readonly<Partial<Record<EndpointName, string>>> = {
  startClaudeSession: STANDALONE_START,
  startComputerClaudeSession: STANDALONE_START,
  controlClaudeSession: UNOWNED_SESSION,
  controlComputerClaudeSession: UNOWNED_SESSION,
  answerClaudePrompt: UNBOUND_PROMPT,
  answerComputerClaudePrompt: UNBOUND_PROMPT,
  registerClaudeController: CONTROLLER_REGISTRATION,
  registerComputerClaudeController: CONTROLLER_REGISTRATION,
  removeClaudeController: CONTROLLER_REMOVAL,
  removeComputerClaudeController: CONTROLLER_REMOVAL,
};

export const MCP_HUMAN_ONLY_OPERATIONS: Readonly<Partial<Record<EndpointName, string>>> = {
  readAssistantVoiceSample:
    'Audio audition is an explicit person-operated Play control in voice settings.',
  updateComputerNativeMcpPolicy:
    'Grants native computer/runtime tool access; only a person changes this policy in the app.',
  createAiHtmlPreviewLease:
    'Issues an isolated document browser credential to the current paired viewer; assistants publish content without reading viewer credentials.',
  createAiPreviewLease:
    'Issues a single-publication browser credential to the current paired viewer; assistants read and revoke publications through the normal operations.',
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
  ingestHealth: 'Phone upload protocol (the phone’s pairing); use log_health to add data.',
  readHealthOutbox: 'Phone delivery protocol (the phone’s pairing) for writing to Health Connect.',
  ackHealthOutbox: 'Phone delivery protocol (the phone’s pairing) for writing to Health Connect.',
  readBleWatch: 'The phone’s Bluetooth listener asks what to listen for.',
  reportClientFailures:
    'An app reports its own redacted errors for diagnosis; there is nothing for an assistant to do with it.',
  watchListeningLevel:
    'A live loudness meter for the person looking at the Listening page; assistants read read_listening.',
  watchWakeTest:
    'A live view for the person testing the wake word; assistants read read_listening and change the name and aliases with update_settings (action assistant).',
  readPhoneListeningConfig:
    'The phone’s own ear asks how to listen; assistants read and change it with read_listening and edit_listening.',
  claimPhoneWake:
    'The phone’s own ear claims a wake it heard; assistants have no ears to claim with.',
  reportPhoneListening:
    'The phone’s own ear uploads speech and its state; assistants read read_listening and read_transcripts.',
  reportPhone: 'A phone reports what it sees about itself; use read_phone to read it.',
  answerPhoneAction: 'A phone answers an action; use run_phone_action to act.',
  answerAppView: 'An app answers a request to show something.',
  uploadPhoneIcon: 'A phone uploads the icon pictures of its apps for the app to show.',
  readPhoneIcon: 'App icon pictures are shown by the app; read_phone detail lists the apps.',
  relayBleAdverts: 'The phone’s Bluetooth listener forwards raw radio adverts.',
  readPhoneWatches:
    'Hands a phone the keys it needs to connect to its watches; keys stay on phones.',
  readAiSpeech:
    'A phone fetches speech the AI sent it by push; use speak to make the AI say something.',
  readWatchData:
    'The phone connected to a watch fetches what it sends the watch; use get_weather and list_people for the same facts.',
  reportWatchState: 'The phone connected to a watch reports what it sees.',
  takeOverWatchBridge:
    'Chooses which phone’s Bluetooth connects to a watch; only the person on that phone decides.',
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
  importGeminiKey:
    'Copies a credential between apps on the computer; the person does it in Settings.',
  setGeminiKey: 'Stores a credential for the voice assistant; the person enters it in Settings.',
  removeGeminiKey: 'Removes the voice assistant’s credential; the person does it in Settings.',
  setOpenRouterKey: 'Stores the OpenRouter credential; the person enters it in Settings.',
  removeOpenRouterKey: 'Removes the OpenRouter credential; the person does it in Settings.',
  declineOutreach: 'A person declines a ringing AI call on their own device.',
  updateReachSettings:
    'The person’s own rules for how the AI may reach them; only they change them in Settings.',
  assistantAttachmentLinks:
    'Returns signed links for a browser; read_chats view attachment returns the file.',
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
};

const MCP_ADMIN_OPERATIONS: Readonly<Partial<Record<EndpointName, string>>> = {
  updateAssistantSettings:
    'Changes the assistant’s instructions, models and limits for everyone; only a person in the app does that.',
  updateAiBudget: 'Sets what the AI may spend; only a person in the app does that.',
  setOpenRouterDefaults:
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
  ['/api/phones', 'devices'],
  ['/api/phone-icons', 'devices'],
  ['/api/nodes', 'devices'],
  ['/api/settings', 'settings'],
  ['/api/layouts', 'settings'],
  ['/api/clipboard', 'settings'],
  ['/api/push-targets', 'settings'],
  ['/api/rooms', 'home'],
  ['/api/weather', 'home'],
  ['/api/exchange-rates', 'settings'],
  ['/api/places', 'home'],
  ['/api/providers', 'home'],
  ['/api/devices', 'devices'],
  ['/api/device-groups', 'devices'],
  ['/api/device-targets', 'devices'],
  ['/api/device-effects', 'devices'],
  ['/api/listening', 'assistant'],
  ['/api/televisions', 'devices'],
  ['/api/computers', 'computers'],
  ['/api/device-state', 'devices'],
  ['/api/ir-', 'devices'],
  ['/api/commands', 'control'],
  ['/api/history', 'history'],
  ['/api/events', 'history'],
  ['/api/cameras', 'cameras'],
  ['/api/camera-transcripts', 'cameras'],
  ['/api/transcript', 'cameras'],
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
  ['/api/claude', 'assistant'],
  ['/api/plugins', 'plugins'],
];

export function mcpOperationArea(endpoint: Pick<EndpointShape, 'path'>): McpToolArea {
  const found = AREA_BY_PREFIX.find(([prefix]) => endpoint.path.startsWith(prefix));
  return found === undefined ? 'system' : found[1];
}

export function isHumanOnlyOperation(name: EndpointName): boolean {
  return MCP_HUMAN_ONLY_OPERATIONS[name] !== undefined;
}

const MCP_CORE_OPERATIONS: Readonly<Partial<Record<McpCoreToolName, EndpointName>>> = {
  list_device_groups: 'listDeviceGroups',
  set_ai_defaults: 'setOpenRouterDefaults',
  get_computer: 'readComputer',
  get_computer_audio: 'readComputerAudio',
  get_computer_displays: 'readComputerDisplays',
  get_computer_system: 'readComputerSystem',
  get_computer_usb: 'readComputerSystem',
  get_computer_windows: 'readComputerWindows',
  get_computer_services: 'readComputerServices',
  get_computer_startup: 'readComputerStartup',
  list_processes: 'listComputerProcesses',
  end_process: 'signalComputerProcess',
  set_computer_audio: 'changeComputerAudio',
  set_computer_display: 'changeComputerDisplay',
  set_computer_system: 'changeComputerSystem',
  focus_window: 'changeComputerWindow',
  minimise_window: 'changeComputerWindow',
  close_window: 'changeComputerWindow',
  edit_computer_files: 'writeComputerFiles',
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

export interface McpAnnotationHints {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

export interface McpOperationTraits {
  readonly hints?: McpAnnotationHints;
  readonly answers?: true;
  readonly returnsImage?: true;
}

const READS_BY_POST: McpOperationTraits = { hints: { readOnlyHint: true, idempotentHint: true } };
const ANSWERS: McpOperationTraits = { answers: true };
const CLAUDE_TURN: McpOperationTraits = {
  hints: { idempotentHint: true, destructiveHint: true, openWorldHint: true },
};

const MCP_OPERATION_TRAITS: Readonly<Partial<Record<EndpointName, McpOperationTraits>>> = {
  searchAiChatReferences: READS_BY_POST,
  readAiProjectFiles: READS_BY_POST,
  readEmbeddedBrowser: READS_BY_POST,
  readPreviewLogs: READS_BY_POST,
  searchPreviewLogs: READS_BY_POST,
  resolveImageInput: READS_BY_POST,
  prepareComputerDownload: READS_BY_POST,
  waitForImages: READS_BY_POST,
  capturePreviewViewport: { ...READS_BY_POST, returnsImage: true },
  writeAiProjectFiles: { hints: { idempotentHint: true, destructiveHint: true } },
  removeAiProjectFiles: { hints: { destructiveHint: true, idempotentHint: true } },
  clearPreviewWebsiteData: {
    hints: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  startClaudeCliSession: CLAUDE_TURN,
  controlClaudeCliSession: CLAUDE_TURN,
  answerClaudeCliPrompt: { hints: { destructiveHint: true, openWorldHint: true } },
  startImageOperation: { hints: { openWorldHint: true } },
  cancelImageOperation: { hints: { idempotentHint: true, openWorldHint: true } },
  listImageEndpoints: { hints: { openWorldHint: true } },
  askAiChat: ANSWERS,
  runAiSubagent: ANSWERS,
  callPluginTool: ANSWERS,
  editEmbeddedBrowser: ANSWERS,
  publishAiHtmlPreview: ANSWERS,
  publishAiProjectPreview: ANSWERS,
};

export function mcpOperationTraits(name: EndpointName): McpOperationTraits {
  return MCP_OPERATION_TRAITS[name] ?? {};
}

export function mcpToolLine(description: string): string {
  const sentence = description.split(/(?<=\.)\s/u)[0] ?? description;
  return sentence.replace(/\.$/u, '');
}
