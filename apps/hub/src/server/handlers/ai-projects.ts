import { AI_PROJECT_ENDPOINTS as E } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ProjectFilesService } from '../../projects/service';
import { projectCallerAuthority } from '../../projects/authority';
import { bound, type Bound } from '../router';
export function aiProjectRoutes(
  store: Store,
  projects: ProjectFilesService,
): Record<keyof typeof E, Bound> {
  return {
    readAiProjectFiles: bound(E.readAiProjectFiles, ({ caller, params, body }) =>
      projects.execute(projectCallerAuthority(store, caller, params.chatId, body), body),
    ),
    writeAiProjectFiles: bound(E.writeAiProjectFiles, ({ caller, params, body }) =>
      projects.execute(projectCallerAuthority(store, caller, params.chatId, body), body),
    ),
    removeAiProjectFiles: bound(E.removeAiProjectFiles, ({ caller, params, body }) =>
      projects.execute(projectCallerAuthority(store, caller, params.chatId, body), body),
    ),
  };
}
