import type { TUYA_REGIONS } from '@smarteverything/domain';

export type TuyaRegion = (typeof TUYA_REGIONS)[number];

export interface RegionEndpoints {
  readonly api: string;
  readonly messages: string;
}

export const TUYA_ENDPOINTS: Readonly<Record<TuyaRegion, RegionEndpoints>> = {
  cn: { api: 'https://openapi.tuyacn.com', messages: 'wss://mqe.tuyacn.com:8285/' },
  us: { api: 'https://openapi.tuyaus.com', messages: 'wss://mqe.tuyaus.com:8285/' },
  'us-e': { api: 'https://openapi-ueaz.tuyaus.com', messages: 'wss://mqe-ueaz.tuyaus.com:8285/' },
  eu: { api: 'https://openapi.tuyaeu.com', messages: 'wss://mqe.tuyaeu.com:8285/' },
  'eu-w': { api: 'https://openapi-weaz.tuyaeu.com', messages: 'wss://mqe-weaz.tuyaeu.com:8285/' },
  in: { api: 'https://openapi.tuyain.com', messages: 'wss://mqe.tuyain.com:8285/' },
  sg: { api: 'https://openapi-sg.iotbing.com', messages: 'wss://mqe-sg.iotbing.com:8285/' },
};
