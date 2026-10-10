import { firewalldRunning, probeFirewalld } from './firewalld';
import { always, type Probe } from './openings';
import type { FirewallSystem } from './system';
import { probeUfw, ufwEnabled } from './ufw';

const RAW_SERVICES = [
  { backend: 'nftables', unit: 'nftables.service' },
  { backend: 'iptables', unit: 'iptables.service' },
] as const;

async function unitActive(system: FirewallSystem, unit: string): Promise<boolean> {
  const result = await system.run('systemctl', ['is-active', unit]);
  return result?.stdout.trim() === 'active';
}

function rawProbe(service: (typeof RAW_SERVICES)[number]): Probe {
  return {
    backend: service.backend,
    filtering: null,
    detail: `${service.unit} loads hand-written ${service.backend} rules, which only root can read and SmartEverything does not change. Allow the openings below in those rules yourself.`,
    stateOf: always('unknown'),
    draft: null,
    fixable: new Set(),
    watch: [],
  };
}

function noFirewall(): Probe {
  return {
    backend: 'none',
    filtering: false,
    detail: 'No ufw, firewalld, nftables or iptables service is active on this computer.',
    stateOf: always('open'),
    draft: null,
    fixable: new Set(),
    watch: ['/etc/ufw'],
  };
}

export async function probeLinux(system: FirewallSystem): Promise<Probe> {
  if (await ufwEnabled(system)) {
    return probeUfw(system);
  }
  if (await firewalldRunning(system)) {
    return probeFirewalld(system);
  }
  for (const service of RAW_SERVICES) {
    if (await unitActive(system, service.unit)) {
      return rawProbe(service);
    }
  }
  return noFirewall();
}
