import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type FirewallRoutes = Record<'readFirewall' | 'checkFirewall', Bound>;

export function firewallRoutes(context: ServerContext): FirewallRoutes {
  return {
    readFirewall: bound(E.readFirewall, () => context.firewall.current()),
    checkFirewall: bound(E.checkFirewall, () => context.firewall.check()),
  };
}
