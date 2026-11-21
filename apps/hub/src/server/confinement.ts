import {
  API_ENDPOINTS,
  ApiError,
  mcpOperationArea,
  type EndpointName,
  type McpToolArea,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { confinedChatOf, type Caller } from './auth';
import type { OperationInput } from './operations';

const SHARED_PROFILE_AREAS: ReadonlySet<McpToolArea> = new Set(['health', 'nutrition']);
const SHARED_PROFILE_OPERATIONS: ReadonlySet<EndpointName> = new Set([
  'listSchedules',
  'createSchedule',
  'updateSchedule',
  'cancelSchedule',
  'runSchedule',
  'removeSchedule',
  'readUsageTotals',
  'readUsageSeries',
  'readUsageSummary',
  'listUsageLedger',
  'readUsageChoices',
  'listOutreach',
  'listCalls',
  'listWakes',
  'listRecordings',
  'listDshSessions',
  'readDshSession',
  'readDshSessionEvents',
]);

function chatIdsOf(input: OperationInput): string[] {
  const body = typeof input.body === 'object' && input.body !== null ? input.body : {};
  return [input.params?.['chatId'], input.query?.['chat_id'], Reflect.get(body, 'chat_id')].filter(
    (id): id is string => typeof id === 'string',
  );
}

export async function admitConfined(
  store: Pick<Store, 'host'>,
  name: EndpointName,
  caller: Caller,
  input: OperationInput,
): Promise<void> {
  const confinedTo = confinedChatOf(caller);
  if (confinedTo === undefined) return;
  if (
    SHARED_PROFILE_OPERATIONS.has(name) ||
    SHARED_PROFILE_AREAS.has(mcpOperationArea(API_ENDPOINTS[name]))
  )
    throw new ApiError('forbidden', 'Only the home owner can read this.');
  const chatIds = chatIdsOf(input);
  if (chatIds.length > 0 && !(await store.host.read('confinedChats', { confinedTo, chatIds })))
    throw new ApiError('forbidden', 'That chat belongs to someone else.');
}
