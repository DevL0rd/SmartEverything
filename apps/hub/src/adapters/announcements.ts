import type { Provider } from '@smarteverything/domain';
import { SSDP_PORT } from '@smarteverything/smartthings';
import { DISCOVERY_PORTS } from '@smarteverything/tuya';

export interface AnnouncementPort {
  readonly protocol: 'udp';
  readonly port: number;
}

export const ANNOUNCEMENT_PORTS: Partial<Readonly<Record<Provider, readonly AnnouncementPort[]>>> =
  {
    tuya: DISCOVERY_PORTS.map((port): AnnouncementPort => ({ protocol: 'udp', port })),
    samsung_tv: [{ protocol: 'udp', port: SSDP_PORT }],
  };
