import { AUTOMATION_SECRET_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import {
  SecretInUseError,
  SecretMissingError,
  type AutomationSecrets,
} from '../../automations/secrets-v3';
import { bound, DONE_REPLY } from '../router';

export const automationSecretRoutes = (secrets: AutomationSecrets) =>
  ({
    listAutomationSecrets: bound(E.listAutomationSecrets, () => secrets.list()),
    setAutomationSecret: bound(E.setAutomationSecret, ({ body }) => secrets.set(body)),
    removeAutomationSecret: bound(E.removeAutomationSecret, async ({ params }) => {
      try {
        await secrets.remove(params.secretId);
      } catch (error) {
        if (error instanceof SecretMissingError) {
          throw new ApiError('not_found', error.message);
        }
        if (error instanceof SecretInUseError) {
          throw new ApiError('conflict', error.message);
        }
        throw error;
      }
      return DONE_REPLY;
    }),
  }) as const;
