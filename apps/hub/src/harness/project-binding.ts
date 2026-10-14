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
  input: { readonly cwd: string; readonly explicit: boolean },
): AiHarnessStorageBinding {
  const { cwd, explicit } = input;
  const id = service.binding(chat).session_id;
  const prior = id === null ? undefined : storedProjectBinding(service.store, id);
  if (!explicit && prior !== undefined) {
    if (prior.kind === 'managed') {
      requireManaged(host);
      return prior;
    }
    return deviceBinding(host, cwd);
  }
  const workspace =
    id === null ? undefined : service.store.dshSessions.workspace(id, host.target, chat.profile_id);
  if (explicit || inheritedDeviceProject(prior, workspace, host)) {
    return deviceBinding(host, cwd);
  }
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

function inheritedDeviceProject(
  prior: AiHarnessStorageBinding | undefined,
  workspace: unknown,
  host: AiHarnessHost,
): boolean {
  return prior === undefined && workspace !== undefined && host.target.kind === 'device';
}

function deviceBinding(host: AiHarnessHost, cwd: string): AiHarnessStorageBinding {
  if (host.target.kind !== 'device')
    throw new ApiError(
      'conflict',
      'This explicit project remains on its device. Hub execution requires a central chat workspace; no shared mount is configured.',
    );
  return { kind: 'device', target: host.target, path: cwd };
}
