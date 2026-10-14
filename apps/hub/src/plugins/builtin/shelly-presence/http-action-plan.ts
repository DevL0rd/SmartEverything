import {
  ApiError,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { rpcPlan, type ShellyActionPlan } from './action-plan';
export function httpActionPlan(
  snapshot: ShellyPresenceDevice,
  action: ShellyPresenceAction,
): ShellyActionPlan | null {
  if (action.action !== 'http_request') return null;
  const { method, url, body, headers, timeout, ssl_ca } = action;
  const methods = new Set(snapshot.methods.map((item) => item.toLowerCase()));
  const params = { url, body, headers, timeout, ssl_ca };
  if (methods.has('http.request')) return rpcPlan('HTTP.Request', { method, ...params });
  if (method === 'GET' && methods.has('http.get')) return rpcPlan('HTTP.GET', params);
  if (method === 'POST' && methods.has('http.post'))
    return rpcPlan('HTTP.POST', { ...params, body: body ?? '' });
  throw new ApiError(
    'command_refused',
    'This firmware does not offer the selected HTTP request method.',
  );
}
