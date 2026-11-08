import { ApiError } from '@smarteverything/domain';

export function externalChatRetired(): never {
  throw new ApiError('conflict', 'External Claude and Codex chat controls have been removed.');
}
