import { storedProjectBinding } from './project-grant';
import {
  ApiError,
  type AiChatRow,
  type AiHarnessHost,
  type AiHarnessStorageBinding,
} from '@smarteverything/domain';
import type { HarnessService } from './service';
export function projectBinding(
  service: HarnessService,
  chat: AiChatRow,
  host: AiHarnessHost,
  _input: { readonly cwd: string; readonly explicit: boolean },
): AiHarnessStorageBinding {
  const id = service.binding(chat).session_id;
  const prior = id === null ? undefined : storedProjectBinding(service.store, id);
  if (prior !== undefined) return prior;
  requireManaged(host);
  return { kind: 'managed', chat_id: chat.id };
}

function requireManaged(host: AiHarnessHost): void {
  if (host.manifest?.project_files?.protocol !== 1)
    throw new ApiError(
      'conflict',
      'This execution host must be upgraded to support the central chat workspace. Existing explicit device projects remain available.',
    );
}
