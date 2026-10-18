import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

export const providerRoutes = ({ hub: { providers }, log, store }: ServerContext) =>
  ({
    linkProvider: bound(E.linkProvider, ({ body }) => {
      if (body.provider === 'samsung_tv' && body.attachTo !== undefined) {
        const target = store.devices.find(body.attachTo);
        if (target?.provider !== 'smartthings' || target.kind !== 'television') {
          throw new ApiError(
            'invalid_request',
            'A direct link attaches to a SmartThings television.',
          );
        }
      }
      providers.link(body).catch((cause: unknown) => {
        log.error('provider.link_failed', cause, { provider: body.provider });
      });
      return DONE_REPLY;
    }),
    answerProviderPrompt: bound(E.answerProviderPrompt, async ({ body }) => {
      await providers.answer(body.provider, body.answer);
      return DONE_REPLY;
    }),
    cancelProviderLink: bound(E.cancelProviderLink, async ({ body }) => {
      await providers.cancelLink(body.provider);
      return DONE_REPLY;
    }),
  }) as const;
