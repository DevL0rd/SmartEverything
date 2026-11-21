import type { IncomingMessage } from 'node:http';
import { API_ENDPOINTS as E, type EndpointShape } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { profileIdOf, type Caller } from '../auth';
import { bound } from '../router';

export interface ModelRouteServices {
  readonly store: Pick<Store, 'host'>;
  readonly authorize: (request: IncomingMessage, endpoint: EndpointShape) => Promise<Caller>;
}

export const modelRoutes = (store: Pick<Store, 'host'>) =>
  ({
    listModels: bound(E.listModels, async ({ query }) => ({
      models: await store.host.read('modelList', query),
    })),
    readDeviceModels: bound(E.readDeviceModels, ({ params }) =>
      store.host.read('modelDeviceModels', params.deviceId),
    ),
    setDeviceModelOverride: bound(E.setDeviceModelOverride, ({ params, body, caller }) =>
      store.host.write('modelOverrideSet', {
        deviceId: params.deviceId,
        input: body,
        setBy: profileIdOf(caller),
      }),
    ),
    resetDeviceModelOverride: bound(E.resetDeviceModelOverride, ({ params, query }) =>
      store.host.write('modelOverrideReset', { deviceId: params.deviceId, scope: query.scope }),
    ),
  }) as const;
