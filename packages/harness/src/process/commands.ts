import {
  AI_HARNESS_COMMAND_DESCRIPTORS,
  AI_HARNESS_COMMAND_OUTCOME,
} from '@smarteverything/domain';
import type { HarnessRuntimeRequest, HarnessRuntimeReceipt } from '@smarteverything/domain';
import type { HarnessSession } from '../host/session';

type CommandRequest = Extract<HarnessRuntimeRequest, { kind: 'command' | 'command_list' }>;
export function isNativeCommandRequest(request: HarnessRuntimeRequest): request is CommandRequest {
  return request.kind === 'command' || request.kind === 'command_list';
}
export async function nativeCommandReceipt(
  session: HarnessSession,
  request: CommandRequest,
  receipt: () => Promise<HarnessRuntimeReceipt>,
  flush: () => Promise<void>,
): Promise<HarnessRuntimeReceipt> {
  if (request.kind === 'command_list')
    return {
      ...(await receipt()),
      commands: AI_HARNESS_COMMAND_DESCRIPTORS.parse(session.commands()),
    };
  const execution = await session.command(
    request.line,
    request.attachments.map((attachment) => {
      if (attachment.type === 'file') return attachment;
      return {
        type: attachment.type,
        mediaType: attachment.mediaType,
        data: attachment.data,
        ...(attachment.name === undefined ? {} : { name: attachment.name }),
      };
    }),
  );
  const command_outcome = AI_HARNESS_COMMAND_OUTCOME.parse(
    execution === undefined
      ? {
          status: 'rejected',
          message: 'Invalid slash-command syntax or unknown command on this Agent.',
        }
      : { status: 'settled', execution },
  );
  await flush();
  return { ...(await receipt()), command_outcome };
}
