import { TUYA_REGIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { TUYA_ENDPOINTS } from '../src';

describe('data centres', () => {
  it('has one API host and one message host for every region the domain allows', () => {
    expect(Object.keys(TUYA_ENDPOINTS).sort()).toStrictEqual([...TUYA_REGIONS].sort());
  });

  it('points each region at its data centre', () => {
    expect(TUYA_ENDPOINTS).toStrictEqual({
      cn: { api: 'https://openapi.tuyacn.com', messages: 'wss://mqe.tuyacn.com:8285/' },
      us: { api: 'https://openapi.tuyaus.com', messages: 'wss://mqe.tuyaus.com:8285/' },
      'us-e': {
        api: 'https://openapi-ueaz.tuyaus.com',
        messages: 'wss://mqe-ueaz.tuyaus.com:8285/',
      },
      eu: { api: 'https://openapi.tuyaeu.com', messages: 'wss://mqe.tuyaeu.com:8285/' },
      'eu-w': {
        api: 'https://openapi-weaz.tuyaeu.com',
        messages: 'wss://mqe-weaz.tuyaeu.com:8285/',
      },
      in: { api: 'https://openapi.tuyain.com', messages: 'wss://mqe.tuyain.com:8285/' },
      sg: { api: 'https://openapi-sg.iotbing.com', messages: 'wss://mqe-sg.iotbing.com:8285/' },
    });
  });
});
