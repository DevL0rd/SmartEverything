import { describe, expect, it } from 'vitest';
import {
  PLUGIN_PERSON,
  PLUGIN_PERSON_CHANGE,
  PLUGIN_REQUESTERS,
  leastTrustedOrigin,
  turnRoleOf,
} from '../src';

const PROFILE = '11111111-1111-4111-8111-111111111111';

describe('plugin people contract', () => {
  it('lets only the owner run a plugin turn with owner powers', () => {
    expect(turnRoleOf('owner')).toBe('owner');
    expect(turnRoleOf('approved')).toBe('member');
    expect(turnRoleOf('unlisted')).toBe('member');
    expect(turnRoleOf(undefined)).toBe('member');
  });

  it('ranks the owner above an approved person and an approved person above a stranger', () => {
    expect(PLUGIN_REQUESTERS).toStrictEqual(['owner', 'approved', 'unlisted']);
    const origins = PLUGIN_REQUESTERS.map((requester) => ({ plugin_id: 'discord', requester }));
    expect(leastTrustedOrigin(origins)?.requester).toBe('unlisted');
    expect(leastTrustedOrigin(origins.slice(0, 2))?.requester).toBe('approved');
    expect(leastTrustedOrigin([])).toBeNull();
  });

  it('takes a change without a home person, with one, or with the link cleared', () => {
    const base = { name: 'Sam', status: 'approved' } as const;
    expect(PLUGIN_PERSON_CHANGE.parse(base)).toStrictEqual(base);
    expect(PLUGIN_PERSON_CHANGE.parse({ ...base, profile_id: PROFILE }).profile_id).toBe(PROFILE);
    expect(PLUGIN_PERSON_CHANGE.parse({ ...base, profile_id: null }).profile_id).toBeNull();
    expect(PLUGIN_PERSON_CHANGE.safeParse({ ...base, profile_id: 'sam' }).success).toBe(false);
  });

  it('always says which home person a stored plugin person is linked to', () => {
    const person = {
      plugin_id: 'discord',
      external_id: '42',
      name: 'Sam',
      status: 'approved',
      added_at: '2026-10-18T10:00:00.000Z',
    };
    expect(PLUGIN_PERSON.safeParse(person).success).toBe(false);
    expect(PLUGIN_PERSON.parse({ ...person, profile_id: null }).profile_id).toBeNull();
  });
});
