import { AI_PREVIEW_ENDPOINTS as E } from '@smarteverything/domain';
import type { PreviewService } from '../../preview/service';
import { bound, type Bound } from '../router';
export function embeddedBrowserRoutes(
  preview: PreviewService,
): Pick<Record<keyof typeof E, Bound>, 'readEmbeddedBrowser' | 'editEmbeddedBrowser'> {
  return {
    readEmbeddedBrowser: bound(E.readEmbeddedBrowser, ({ caller, params, body }) =>
      preview.browserControllers.read(caller, params.chatId, body),
    ),
    editEmbeddedBrowser: bound(E.editEmbeddedBrowser, ({ caller, params, body }) =>
      preview.browserControllers.edit(caller, params.chatId, body),
    ),
  };
}
