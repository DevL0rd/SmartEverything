import { describe, expect, it } from 'vitest';
import {
  ACCESS_AUDIT_ENTRY,
  ACCESS_REQUEST_ROW,
  ACCESS_SCOPES,
  MCP_TOOL_AREAS,
  NEW_ACCESS_REQUEST,
  NOTHING_IN_SCOPE,
  PERSON_ACCESS,
  PERSON_ACCESS_CHANGE,
  PERSON_BUDGET,
  PERSON_TEMPLATES,
  TEMPLATE_SCOPES,
  areaInScope,
  channelInScope,
  deviceInScope,
  effectiveRoleOf,
  isExpired,
  modelInScope,
} from '../src';

const PROFILE = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-18T10:00:00.000Z';

describe('person access contract', () => {
  it('lets only an owner device acting as an owner person be the owner', () => {
    expect(effectiveRoleOf('owner', 'owner')).toBe('owner');
    expect(effectiveRoleOf('owner', 'member')).toBe('member');
    expect(effectiveRoleOf('owner', 'guest')).toBe('member');
    expect(effectiveRoleOf('member', 'owner')).toBe('member');
  });

  it('treats a guest as expired from the moment of the end time', () => {
    expect(isExpired({ expires_at: null }, NOW)).toBe(false);
    expect(isExpired({ expires_at: '2026-10-18T10:00:01.000Z' }, NOW)).toBe(false);
    expect(isExpired({ expires_at: NOW }, NOW)).toBe(true);
  });

  it('gives every template explicit scopes that parse', () => {
    for (const template of PERSON_TEMPLATES) {
      expect(ACCESS_SCOPES.parse(TEMPLATE_SCOPES[template])).toStrictEqual(
        TEMPLATE_SCOPES[template],
      );
    }
    expect(TEMPLATE_SCOPES.owner.areas).toStrictEqual([...MCP_TOOL_AREAS]);
    expect(TEMPLATE_SCOPES.child.areas).not.toContain('settings');
    expect(TEMPLATE_SCOPES.guest.areas).not.toContain('health');
    expect(TEMPLATE_SCOPES.child.areas).toContain('health');
  });

  it('reads a stored person and refuses unknown fields', () => {
    const stored = {
      profile_id: PROFILE,
      role: 'guest',
      template: 'guest',
      scopes: TEMPLATE_SCOPES.guest,
      budget: { daily_usd: 1, monthly_usd: null, warn_at_percent: 80, hard_stop: true },
      conditions: { home_only: true, schedule: { from: '22:00', to: '07:00', urgent: false } },
      expires_at: '2026-10-20T10:00:00.000Z',
      updated_at: NOW,
    };
    expect(PERSON_ACCESS.parse(stored)).toStrictEqual(stored);
    expect(() => PERSON_ACCESS.parse({ ...stored, extra: 1 })).toThrow();
    expect(() => PERSON_ACCESS.parse({ ...stored, role: 'admin' })).toThrow();
  });

  it('keeps a per-person budget to daily, monthly, warning and hard stop', () => {
    expect(PERSON_BUDGET.parse({})).toStrictEqual({
      daily_usd: null,
      monthly_usd: null,
      warn_at_percent: 80,
      hard_stop: false,
    });
    expect(() => PERSON_BUDGET.parse({ burn: { usd: 1, minutes: 10 } })).toThrow();
  });

  it('requires a change to name at least one field', () => {
    expect(() => PERSON_ACCESS_CHANGE.parse({})).toThrow();
    expect(PERSON_ACCESS_CHANGE.parse({ expires_at: null })).toStrictEqual({ expires_at: null });
  });

  it('describes audit entries and requests', () => {
    const entry = {
      profile_id: PROFILE,
      client_id: null,
      kind: 'refused_scope',
      detail: 'devices',
    };
    expect(ACCESS_AUDIT_ENTRY.parse(entry)).toStrictEqual(entry);
    expect(() => ACCESS_AUDIT_ENTRY.parse({ ...entry, kind: 'allowed' })).toThrow();
    const request = { kind: 'budget', target: null, note: '' };
    expect(NEW_ACCESS_REQUEST.parse(request)).toStrictEqual(request);
    const row = {
      ...request,
      id: PROFILE,
      profile_id: PROFILE,
      status: 'pending',
      until: null,
      requested_at: NOW,
      decided_at: null,
      decided_by: null,
    };
    expect(ACCESS_REQUEST_ROW.parse(row)).toStrictEqual(row);
  });

  it('keeps a person to the areas they hold', () => {
    expect(areaInScope(TEMPLATE_SCOPES.child, 'devices')).toBe(true);
    expect(areaInScope(TEMPLATE_SCOPES.child, 'settings')).toBe(false);
    expect(areaInScope(NOTHING_IN_SCOPE, 'home')).toBe(false);
  });

  it('applies the device list as everything, only the named ones, or all but the named ones', () => {
    const lamp = { id: 'lamp', room_id: 'study' };
    const fan = { id: 'fan', room_id: 'hall' };
    const loose = { id: 'loose', room_id: null };
    const everything = { mode: 'all', rooms: ['study'], devices: ['fan'] } as const;
    const only = { mode: 'only', rooms: ['study'], devices: ['fan'] } as const;
    const except = { mode: 'except', rooms: ['study'], devices: ['fan'] } as const;
    expect([lamp, fan, loose].map((device) => deviceInScope(everything, device))).toStrictEqual([
      true,
      true,
      true,
    ]);
    expect([lamp, fan, loose].map((device) => deviceInScope(only, device))).toStrictEqual([
      true,
      true,
      false,
    ]);
    expect([lamp, fan, loose].map((device) => deviceInScope(except, device))).toStrictEqual([
      false,
      false,
      true,
    ]);
    expect(deviceInScope(NOTHING_IN_SCOPE.devices, lamp)).toBe(false);
  });

  it('applies the model and channel lists', () => {
    expect(modelInScope({ mode: 'default', ids: [] }, 'openai/gpt-5')).toBe(true);
    expect(modelInScope({ mode: 'only', ids: ['openai/gpt-5'] }, 'openai/gpt-5')).toBe(true);
    expect(modelInScope({ mode: 'only', ids: ['openai/gpt-5'] }, 'google/gemini')).toBe(false);
    expect(channelInScope({ mode: 'all', ids: [] }, 'house')).toBe(true);
    expect(channelInScope({ mode: 'only', ids: ['house'] }, 'house')).toBe(true);
    expect(channelInScope({ mode: 'only', ids: ['house'] }, 'garage')).toBe(false);
    expect(channelInScope(NOTHING_IN_SCOPE.channels, 'house')).toBe(false);
    expect(modelInScope(NOTHING_IN_SCOPE.models, 'openai/gpt-5')).toBe(false);
  });
});
