import { EMBEDDED_BROWSER_ENDPOINTS as E } from '@smarteverything/domain';
import type { BrowserService } from '../../browser/service';
import { bound } from '../router';
export const embeddedBrowserRoutes = (browser: BrowserService) =>
  ({
    readEmbeddedBrowser: bound(E.readEmbeddedBrowser, ({ caller, params, body }) =>
      browser.controllers.read(caller, params.chatId, body),
    ),
    editEmbeddedBrowser: bound(E.editEmbeddedBrowser, ({ caller, params, body }) =>
      browser.controllers.edit(caller, params.chatId, body),
    ),
  }) as const;
