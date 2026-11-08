import type { EndpointName } from '../api/endpoints';

export interface McpAnnotationHints {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

export interface McpOperationTraits {
  readonly hints?: McpAnnotationHints;
  readonly answers?: true;
  readonly callIdentity?: { readonly field: string; readonly scope: 'image' | 'turn' };
  readonly householdWide?: true;
}

const READS_BY_POST: McpOperationTraits = { hints: { readOnlyHint: true, idempotentHint: true } };
const ANSWERS: McpOperationTraits = { answers: true };
const REACHES_OUT: McpOperationTraits = { hints: { openWorldHint: true } };
const CLAUDE_TURN: McpOperationTraits = {
  hints: { idempotentHint: true, destructiveHint: true, openWorldHint: true },
};
const IMAGE_OPERATION: McpOperationTraits = {
  hints: { openWorldHint: true },
  callIdentity: { field: 'operationId', scope: 'image' },
};

const MCP_OPERATION_TRAITS: Readonly<Partial<Record<EndpointName, McpOperationTraits>>> = {
  searchAiChatReferences: READS_BY_POST,
  readAiProjectFiles: READS_BY_POST,
  readEmbeddedBrowser: READS_BY_POST,
  prepareComputerDownload: READS_BY_POST,
  discoverAiHarnessExtensions: READS_BY_POST,
  previewAiHarnessExtensions: READS_BY_POST,
  resolveAiHarnessSkill: READS_BY_POST,
  readDshSessionEvents: READS_BY_POST,
  installAiHarnessExtensions: ANSWERS,
  writeAiProjectFiles: { hints: { idempotentHint: true, destructiveHint: true } },
  removeAiProjectFiles: { hints: { destructiveHint: true, idempotentHint: true } },
  startClaudeCliSession: CLAUDE_TURN,
  controlClaudeCliSession: CLAUDE_TURN,
  answerClaudeCliPrompt: { hints: { destructiveHint: true, openWorldHint: true } },
  generateImageOperation: IMAGE_OPERATION,
  editImageOperation: IMAGE_OPERATION,
  cancelImageOperation: { hints: { idempotentHint: true, openWorldHint: true } },
  listImageEndpoints: { hints: { openWorldHint: true } },
  showInApp: { answers: true, hints: { idempotentHint: true } },
  createProfile: { householdWide: true },
  updateHome: { householdWide: true },
  runSchedule: REACHES_OUT,
  startProgramRun: REACHES_OUT,
  refreshWeather: { hints: { idempotentHint: true, openWorldHint: true } },
  refreshExchangeRates: { hints: { idempotentHint: true, openWorldHint: true } },
  setAutomationSecret: { hints: { idempotentHint: true } },
  askAiChat: ANSWERS,
  runAiSubagent: ANSWERS,
  callPluginTool: ANSWERS,
  editEmbeddedBrowser: { ...ANSWERS, hints: { openWorldHint: true } },
  closeComputerApp: { hints: { destructiveHint: true } },
  dismissAiRepairGroups: { hints: { destructiveHint: true } },
  runPhoneAction: REACHES_OUT,
  runWatchAction: REACHES_OUT,
  postChatVoiceReply: {
    hints: { openWorldHint: true },
    callIdentity: { field: 'operationId', scope: 'turn' },
  },
  speak: REACHES_OUT,
  callPerson: REACHES_OUT,
  startConversation: REACHES_OUT,
  notifyPerson: REACHES_OUT,
};

export function mcpOperationTraits(name: EndpointName): McpOperationTraits {
  return MCP_OPERATION_TRAITS[name] ?? {};
}
