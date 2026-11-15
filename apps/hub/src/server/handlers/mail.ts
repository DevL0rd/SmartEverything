import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { MailService } from '../../mail/service';
import type { MailSettingsStore } from '../../mail/settings';
import { bound } from '../router';

export interface MailServices {
  readonly settings: MailSettingsStore;
  readonly service: MailService;
}

export const mailRoutes = (services: MailServices) =>
  ({
    readMailSettings: bound(E.readMailSettings, () => services.settings.view()),
    writeMailSettings: bound(E.writeMailSettings, ({ body }) => services.settings.write(body)),
    sendMailTest: bound(E.sendMailTest, ({ body }) => services.service.test(body.to)),
  }) as const;
