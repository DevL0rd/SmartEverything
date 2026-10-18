import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publicUrlState, requiredPaths } from '../../src/extensions/smartthings/paths';
import { testStore, type TestStore } from '../support/store';

let fixture: TestStore;

beforeEach(async () => {
  fixture = await testStore();
});

afterEach(async () => {
  await fixture.close();
});

describe('the SmartThings public paths', () => {
  it('builds the redirect and webhook addresses from a saved address that was not verified', () => {
    fixture.store.settings.setPublicUrl('https://home.example.com');
    expect(publicUrlState(fixture.store)).toBe('unverified');
    expect(requiredPaths(fixture.store)).toEqual({
      redirectUri: 'https://home.example.com/smartthings/callback',
      webhookUrl: 'https://home.example.com/smartthings/webhook',
      webhookPath: '/smartthings/webhook',
    });
  });

  it('asks for the public URL when none is saved', () => {
    expect(publicUrlState(fixture.store)).toBe('missing');
    expect(() => requiredPaths(fixture.store)).toThrow(/save the public URL first/u);
  });
});
