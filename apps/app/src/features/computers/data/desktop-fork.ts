import { randomUUID } from 'expo-crypto';
import {
  AI_CHAT_TITLE_MAX,
  API_ENDPOINTS as E,
  ApiError,
  type ClaudeCliReceipt,
  type ClaudeCliStart,
  type ClaudeSession,
  type ComputerAiModel,
  type ComputerAiStatus,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { rawErrorText } from '../../../format/errors';
import { continueAccess } from '../model/continue-access';
import { readComputerAi } from './computer-ai';

export interface DesktopForkIo {
  readonly readStatus: (deviceId: string) => Promise<ComputerAiStatus>;
  readonly listModels: (deviceId: string) => Promise<readonly ComputerAiModel[]>;
  readonly start: (
    deviceId: string,
    body: ClaudeCliStart,
  ) => Promise<Pick<ClaudeCliReceipt, 'state' | 'chat_id' | 'reason'>>;
  readonly newId: () => string;
}

export const DESKTOP_FORK_UNSUPPORTED =
  'The home hub can’t open Desktop chats in the app yet. It needs its pending update.';

const LIVE_IO: DesktopForkIo = {
  readStatus: readComputerAi,
  listModels: (deviceId) => api().call(E.listComputerClaudeModels, { params: { deviceId } }),
  start: (deviceId, body) => api().call(E.startClaudeCliSession, { params: { deviceId }, body }),
  newId: randomUUID,
};

export async function forkDesktopSession(
  target: {
    readonly deviceId: string;
    readonly session: ClaudeSession;
    readonly owner: boolean;
    readonly preferredModel?: string | undefined;
  },
  io: DesktopForkIo = LIVE_IO,
): Promise<string> {
  const { deviceId, session, owner } = target;
  const cwd = session.cwd;
  if (cwd === null) throw new Error('This session has no folder, so it can’t be opened here.');
  const status = await io.readStatus(deviceId);
  const access = continueAccess(status, owner);
  if ('reason' in access) throw new Error(access.reason);
  const model = forkModelOf(await io.listModels(deviceId), session, target.preferredModel);
  if (model === undefined) throw new Error('Claude has no available model on this computer.');
  const receipt = await started(io, deviceId, {
    operation_id: io.newId(),
    model: model.id,
    effort: null,
    settings: {
      ...access.status.settings.provider.options,
      cwd,
      ...(session.permission_mode === 'unknown'
        ? {}
        : { permission_mode: session.permission_mode }),
    },
    continue_from: { session_id: session.id },
    ...(session.title === null ? {} : { title: session.title.slice(0, AI_CHAT_TITLE_MAX) }),
  });
  if (receipt.state !== 'accepted')
    throw new Error(receipt.reason ?? 'The computer didn’t confirm the fork.');
  return receipt.chat_id;
}

export function forkModelOf(
  models: readonly ComputerAiModel[],
  session: Pick<ClaudeSession, 'model'>,
  preferred: string | undefined,
): ComputerAiModel | undefined {
  const usable = models.filter((row) => row.available);
  const own = usable.find(
    (row) =>
      session.model !== null && (row.id === session.model || row.resolved_model === session.model),
  );
  return own ?? usable.find((row) => row.id === preferred) ?? usable[0];
}

async function started(
  io: DesktopForkIo,
  deviceId: string,
  body: ClaudeCliStart,
): ReturnType<DesktopForkIo['start']> {
  try {
    return await io.start(deviceId, body);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'invalid_request')
      throw new Error(DESKTOP_FORK_UNSUPPORTED, { cause: error });
    throw new Error(rawErrorText(error), { cause: error });
  }
}
