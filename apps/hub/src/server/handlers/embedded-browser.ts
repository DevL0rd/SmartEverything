import { AI_PREVIEW_ENDPOINTS as E } from '@smarteverything/domain';
import type { PreviewService } from '../../preview/service';
import { bound } from '../router';
export const embeddedBrowserRoutes = (preview: PreviewService) =>
  ({
    readEmbeddedBrowser: bound(E.readEmbeddedBrowser, ({ caller, params, body }) =>
      preview.browserControllers.read(caller, params.chatId, body),
    ),
    editEmbeddedBrowser: bound(E.editEmbeddedBrowser, ({ caller, params, body }) =>
      preview.browserControllers.edit(caller, params.chatId, body),
    ),
  }) as const;
