import { AI_PROJECT_ENDPOINTS as E } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ProjectFilesService } from '../../projects/service';
import { projectCallerAuthority } from '../../projects/authority';
import { bound } from '../router';
export const aiProjectRoutes = (store: Store, projects: ProjectFilesService) =>
  ({
    readAiProjectFiles: bound(E.readAiProjectFiles, async ({ caller, params, body }) =>
      projects.execute(await projectCallerAuthority(store, caller, params.chatId, body), body),
    ),
    writeAiProjectFiles: bound(E.writeAiProjectFiles, async ({ caller, params, body }) =>
      projects.execute(await projectCallerAuthority(store, caller, params.chatId, body), body),
    ),
    removeAiProjectFiles: bound(E.removeAiProjectFiles, async ({ caller, params, body }) =>
      projects.execute(await projectCallerAuthority(store, caller, params.chatId, body), body),
    ),
  }) as const;
