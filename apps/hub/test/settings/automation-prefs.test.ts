import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { callTool, structured, type ToolResult } from '../mcp/client';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

const AUTOMATION = '3f6c1f0e-1b7e-4c1c-9d0a-0f2f6b7a1a11';
const NODE = '8a1d5c52-2a8c-4b53-8f6b-5f0f3a9d7c22';
const KEYS = ['automations_editor', 'automations_palette', 'automations_breakpoints'];

const LISTED = z.object({
  preferences: z.array(
    z.looseObject({ key: z.string(), scope: z.string(), value: z.unknown(), allowed: z.unknown() }),
  ),
});

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'ChatGPT' },
  });
  token = E.createMcpToken.response.parse(created.body).token;
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

function tool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return callTool(booted.base, token, name, args);
}

async function listed(): Promise<z.infer<typeof LISTED>['preferences']> {
  return LISTED.parse(structured(await tool('get_settings', { view: 'app' }))).preferences;
}

describe('automation preferences through the AI settings tools', () => {
  it('get_settings lists the three per-person entries with their defaults', async () => {
    const preferences = await listed();
    for (const key of KEYS) {
      const entry = preferences.find((candidate) => candidate.key === key);
      expect(entry?.scope).toBe('per person');
      expect(entry?.allowed).toBeTruthy();
    }
    expect(preferences.find((entry) => entry.key === 'automations_editor')?.value).toEqual({
      view: { phone: 'auto', tablet: 'auto', desktop: 'auto' },
    });
    expect(preferences.find((entry) => entry.key === 'automations_palette')?.value).toEqual({
      recents: [],
      favourites: [],
    });
    expect(preferences.find((entry) => entry.key === 'automations_breakpoints')?.value).toEqual({
      byAutomation: {},
    });
  });

  it('set_preference writes each entry for the person and get_settings reads it back', async () => {
    const view = { phone: 'outline', tablet: 'auto', desktop: 'canvas' };
    structured(
      await tool('update_settings', {
        action: 'preference',
        preference: 'automations_editor',
        value: { view },
      }),
    );
    structured(
      await tool('update_settings', {
        action: 'preference',
        preference: 'automations_palette',
        value: { favourites: ['flow.if'] },
      }),
    );
    structured(
      await tool('update_settings', {
        action: 'preference',
        preference: 'automations_breakpoints',
        value: { byAutomation: { [AUTOMATION]: [NODE] } },
      }),
    );
    const preferences = await listed();
    expect(preferences.find((entry) => entry.key === 'automations_editor')?.value).toEqual({
      view,
    });
    expect(preferences.find((entry) => entry.key === 'automations_palette')?.value).toEqual({
      recents: [],
      favourites: ['flow.if'],
    });
    expect(preferences.find((entry) => entry.key === 'automations_breakpoints')?.value).toEqual({
      byAutomation: { [AUTOMATION]: [NODE] },
    });
  });

  it('refuses a value outside the schema and keeps what was stored', async () => {
    const refused = await tool('update_settings', {
      action: 'preference',
      preference: 'automations_palette',
      value: { recents: ['Not A Kind'] },
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('automations-palette');
    const preferences = await listed();
    expect(preferences.find((entry) => entry.key === 'automations_palette')?.value).toEqual({
      recents: [],
      favourites: [],
    });
  });
});
