import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound } from '../router';

export const firewallRoutes = (context: ServerContext) =>
  ({
    readFirewall: bound(E.readFirewall, () => context.firewall.current()),
    checkFirewall: bound(E.checkFirewall, () => context.firewall.check()),
  }) as const;
