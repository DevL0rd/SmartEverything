import {
  PLUGIN_BUILTINS_SYNC_UNIT,
  PLUGIN_DATA_POINTS_UNIT,
  PLUGIN_PEOPLE_LIST_UNIT,
  PLUGIN_PERSON_REMOVE_UNIT,
  PLUGIN_PERSON_SET_UNIT,
  PLUGIN_SEARCH_HITS_UNIT,
} from '../../plugins/plugin-units';
import { PLUGIN_PICTURE_UNIT } from '../../plugins/picture-file';
import { PLUGIN_IDENTITY_UNIT } from '../../plugins/plugin-identity';
import { BUILD_SOURCES_UNIT, BUILD_SOURCES_UPDATE_UNIT } from '../../self-update/build-source';
import { HUB_UPDATE_NOTES_UNIT } from '../../self-update/completion';
import {
  COMPUTER_ACCESS_VIEW_UNIT,
  COMPUTER_VISIBLE_TO_UNIT,
} from '../../computers/computer-visibility';
import { CHAT_SERVER_COMPUTER_UNIT } from '../../browser/chat-server';
import { APP_VIEW_CLIENTS_UNIT } from '../../app-view/app-view-units';
import { COMPUTER_NODE_CLAIM_UNIT } from '../../computers/node-units';
import { COMPUTER_MCP_GRANT_MANAGE_UNIT } from '../../computers/node-mcp-grant';
import { COMMAND_ORIGIN_UNIT } from '../../computers/computer-records';
import {
  LEDGER_AMEND_UNIT,
  LEDGER_CHOICES_UNIT,
  LEDGER_METERED_AMEND_UNIT,
  LEDGER_RECORD_DURABLE_UNIT,
  LEDGER_RECORD_UNIT,
} from '../../ledger/units';
import { MACHINE_APPROVERS_UNIT } from '../../machines/approval';
import { AI_MODELS_STATE_UNIT } from '../ai-models-state';
import { COMPUTER_AI_STATE_UNIT } from '../computer-ai-state';
import { COMPUTER_ACCESS_STATE_UNIT, COMPUTER_NODE_FACTS_UNIT } from '../computer-access-state';

export const SYSTEM_READ_UNITS = {
  aiModelsState: AI_MODELS_STATE_UNIT,
  appViewClients: APP_VIEW_CLIENTS_UNIT,
  buildSources: BUILD_SOURCES_UNIT,
  chatServerComputer: CHAT_SERVER_COMPUTER_UNIT,
  commandOrigin: COMMAND_ORIGIN_UNIT,
  computerAccessState: COMPUTER_ACCESS_STATE_UNIT,
  computerAccessView: COMPUTER_ACCESS_VIEW_UNIT,
  computerAiState: COMPUTER_AI_STATE_UNIT,
  computerNodeFacts: COMPUTER_NODE_FACTS_UNIT,
  computerVisibleTo: COMPUTER_VISIBLE_TO_UNIT,
  ledgerChoices: LEDGER_CHOICES_UNIT,
  machineApprovers: MACHINE_APPROVERS_UNIT,
  pluginDataPoints: PLUGIN_DATA_POINTS_UNIT,
  pluginIdentity: PLUGIN_IDENTITY_UNIT,
  pluginPeopleList: PLUGIN_PEOPLE_LIST_UNIT,
  pluginPicture: PLUGIN_PICTURE_UNIT,
  pluginSearchHits: PLUGIN_SEARCH_HITS_UNIT,
} as const;

export const SYSTEM_WRITE_UNITS = {
  buildSourcesUpdate: BUILD_SOURCES_UPDATE_UNIT,
  computerMcpGrantManage: COMPUTER_MCP_GRANT_MANAGE_UNIT,
  computerNodeClaim: COMPUTER_NODE_CLAIM_UNIT,
  hubUpdateNotes: HUB_UPDATE_NOTES_UNIT,
  ledgerAmend: LEDGER_AMEND_UNIT,
  ledgerMeteredAmend: LEDGER_METERED_AMEND_UNIT,
  ledgerRecord: LEDGER_RECORD_UNIT,
  ledgerRecordDurable: LEDGER_RECORD_DURABLE_UNIT,
  pluginBuiltinsSync: PLUGIN_BUILTINS_SYNC_UNIT,
  pluginPersonRemove: PLUGIN_PERSON_REMOVE_UNIT,
  pluginPersonSet: PLUGIN_PERSON_SET_UNIT,
} as const;
