import { type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type SmartThingsAppStatus,
  type SmartThingsSetup,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { SMARTTHINGS_APP_KEY } from '../queries/keys';
import { api } from './transport';

const log = new Logger('app.smartthings');

export function useSmartThingsApp(): UseQueryResult<SmartThingsAppStatus> {
  return useScreenQuery({
    queryKey: SMARTTHINGS_APP_KEY,
    queryFn: () => api().call(E.readSmartThingsApp, {}),
  });
}

export async function setUpSmartThings(token: string): Promise<SmartThingsSetup> {
  const setup = await api().call(E.setUpSmartThings, { body: { token } });
  log.info('smartthings.setup', { outcome: setup.outcome });
  return setup;
}

export async function authorizeSmartThings(): Promise<string> {
  const authorization = await api().call(E.authorizeSmartThings, {});
  log.info('smartthings.authorization_started');
  return authorization.url;
}
