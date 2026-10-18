import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  HUB_COMMAND,
  PROVIDER_CREDENTIALS,
  PROVIDER_PROMPT,
  isHubCapability,
} from '../src';

describe('hub commands', () => {
  it('recognises hub capabilities', () => {
    expect(isHubCapability('hub:discover')).toBe(true);
    expect(isHubCapability('power')).toBe(false);
    expect(isHubCapability('raw:hub:x')).toBe(false);
  });

  it('parses every hub command', () => {
    for (const command of [
      { capability: 'hub:unlink_provider', value: { provider: 'smartthings' } },
      { capability: 'hub:discover', value: { provider: null } },
      {
        capability: 'hub:record_clip',
        value: { deviceId: '6f9a2a39-6d0b-4bde-9c8a-4f3f1a1b2c3d', seconds: 30 },
      },
    ]) {
      expect(HUB_COMMAND.parse(command)).toStrictEqual(command);
    }
  });

  it('records clips between five seconds and five minutes long', () => {
    const clip = (seconds: number): boolean =>
      HUB_COMMAND.safeParse({
        capability: 'hub:record_clip',
        value: { deviceId: '6f9a2a39-6d0b-4bde-9c8a-4f3f1a1b2c3d', seconds },
      }).success;
    expect([4, 5, 300, 301, 12.5].map(clip)).toStrictEqual([false, true, true, false, false]);
  });

  it('parses credentials for every provider', () => {
    for (const credentials of [
      { provider: 'xiaomi', username: 'person@example.com', password: 'hunter22', region: 'de' },
      { provider: 'tuya', method: 'smart_life', userCode: 'EU1234' },
      {
        provider: 'tuya',
        method: 'developer_project',
        accessId: 'access-id',
        accessSecret: 'access-secret',
        region: 'eu',
        appUserId: 'eu1666',
      },
      { provider: 'smartthings', code: 'code-123', redirectUri: 'https://example.com/cb' },
      { provider: 'samsung_tv', host: '10.0.0.5', macAddress: 'aa:bb:cc:00:11:22', name: 'TV' },
    ]) {
      expect(PROVIDER_CREDENTIALS.parse(credentials)).toStrictEqual(credentials);
    }
    for (const empty of [
      { provider: 'xiaomi', username: '', password: 'p', region: 'de' },
      { provider: 'xiaomi', username: 'u', password: '', region: 'de' },
      {
        provider: 'tuya',
        method: 'developer_project',
        accessId: '',
        accessSecret: 's',
        region: 'eu',
        appUserId: 'u',
      },
      {
        provider: 'tuya',
        method: 'developer_project',
        accessId: 'a',
        accessSecret: '',
        region: 'eu',
        appUserId: 'u',
      },
      {
        provider: 'tuya',
        method: 'developer_project',
        accessId: 'a',
        accessSecret: 's',
        region: 'eu',
        appUserId: '',
      },
      { provider: 'smartthings', code: '', redirectUri: 'https://example.com/cb' },
      { provider: 'samsung_tv', host: '', macAddress: 'aa:bb:cc:dd:ee:ff', name: 'TV' },
      { provider: 'samsung_tv', host: 'h', macAddress: 'aa:bb:cc:dd:ee:ff', name: '' },
    ]) {
      expect(PROVIDER_CREDENTIALS.safeParse(empty).success).toBe(false);
    }
    expect(
      PROVIDER_CREDENTIALS.safeParse({
        provider: 'samsung_tv',
        host: 'h',
        macAddress: 'aa:bb:cc:dd:ee',
        name: 'TV',
      }).success,
    ).toBe(false);
    expect(
      PROVIDER_CREDENTIALS.safeParse({
        provider: 'samsung_tv',
        host: 'h',
        macAddress: 'aa:bb:cc:dd:ee:ff:00',
        name: 'TV',
      }).success,
    ).toBe(false);
  });

  it('parses every prompt', () => {
    for (const prompt of [
      { kind: 'captcha', image: 'data:image/png;base64,AA' },
      { kind: 'verification_code', destination: 'a***@b.c' },
      { kind: 'accept_on_device', device: 'TV' },
      { kind: 'authorize', url: 'https://example.com' },
      {
        kind: 'scan_qr',
        app: 'Smart Life',
        content: 'tuyaSmart--qrLogin?token=t',
        expiresAt: '2026-10-16T10:05:00.000Z',
      },
    ]) {
      expect(PROVIDER_PROMPT.parse(prompt)).toStrictEqual(prompt);
    }
    expect(PROVIDER_PROMPT.safeParse({ kind: 'captcha', image: 'https://x' }).success).toBe(false);
  });

  it('asks a QR prompt for the moment it expires', () => {
    expect(
      PROVIDER_PROMPT.safeParse({ kind: 'scan_qr', app: 'Smart Life', content: 'qr' }).success,
    ).toBe(false);
  });

  it('no longer accepts the retired sealed link and answer commands', () => {
    for (const capability of ['hub:link_provider', 'hub:answer_prompt']) {
      expect(HUB_COMMAND.safeParse({ capability, value: { provider: 'xiaomi' } }).success).toBe(
        false,
      );
    }
  });
});

describe('provider link endpoints', () => {
  it('take plain credentials, answers and cancellations from the owner', () => {
    const { linkProvider, answerProviderPrompt, cancelProviderLink } = API_ENDPOINTS;
    expect([
      linkProvider.access,
      answerProviderPrompt.access,
      cancelProviderLink.access,
    ]).toStrictEqual(['owner', 'owner', 'owner']);
    const credentials = {
      provider: 'xiaomi',
      username: 'person@example.com',
      password: 'pw',
      region: 'de',
    };
    expect(linkProvider.body.parse(credentials)).toStrictEqual(credentials);
    expect(linkProvider.body.safeParse({ ...credentials, password: '' }).success).toBe(false);
    expect(answerProviderPrompt.body.parse({ provider: 'tuya', answer: '482913' })).toStrictEqual({
      provider: 'tuya',
      answer: '482913',
    });
    expect(answerProviderPrompt.body.safeParse({ provider: 'tuya', answer: '' }).success).toBe(
      false,
    );
    expect(cancelProviderLink.body.parse({ provider: 'samsung_tv' })).toStrictEqual({
      provider: 'samsung_tv',
    });
    expect(cancelProviderLink.body.safeParse({ provider: 'nobody' }).success).toBe(false);
  });
});
