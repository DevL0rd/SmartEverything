import { describe, expect, it } from 'vitest';
import type { Device } from '../../../store/state';
import { SCOPE_ROWS } from '../scopes/scope-rows';
import { computerPages } from './pages';

function device(kind: Device['kind']): Device {
  return {
    id: 'computer-1',
    provider: 'local',
    external_id: 'computer-1',
    parent_id: null,
    kind,
    name: 'Workstation',
    display_name: null,
    model: 'Test',
    manufacturer: 'Test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    label: 'Workstation',
  };
}

const PAGES = computerPages(device('computer'));

function pageOf(id: string): readonly string[] {
  return PAGES.find((page) => page.id === id)?.settings ?? [];
}

describe('computer pages', () => {
  it('are offered to computers only', () => {
    expect(computerPages(device('light'))).toEqual([]);
    expect(PAGES.length).toBeGreaterThan(0);
  });

  it('have unique ids', () => {
    const ids = PAGES.map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keep each computer-level string on exactly one page', () => {
    const own = ['overview', 'performance', 'files', 'processes', 'scopes'];
    const others = PAGES.filter((page) => !own.includes(page.id)).flatMap((page) => page.settings);
    const strings = own.flatMap(pageOf);
    expect(new Set(strings).size).toBe(strings.length);
    expect(strings.filter((title) => others.includes(title))).toEqual([]);
  });

  it('point the connection settings at the overview, not at Claude', () => {
    for (const title of ['Pair another computer', 'Revoke computer connection']) {
      expect(pageOf('overview')).toContain(title);
      expect(pageOf('claude')).not.toContain(title);
    }
  });

  it('cover the three sub-pages and both runtimes', () => {
    const ids = PAGES.map((page) => page.id);
    for (const id of [
      'overview',
      'performance',
      'files',
      'processes',
      'scopes',
      'claude',
      'codex',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('list every access scope on the scopes page', () => {
    expect(pageOf('scopes')).toEqual(SCOPE_ROWS.map((row) => row.title));
  });

  it('re-point every earlier settings string at its new wording on the same page', () => {
    const renamed: Readonly<Record<string, Readonly<Record<string, string>>>> = {
      codex: { 'Subscription route': 'Plan' },
      'codex-sessions': {
        'New native session': 'New Codex session',
        'Pending requests': 'Requested scope',
        Permissions: 'Access',
      },
      'codex-provider': { 'Approval policy': 'When to ask', 'Sandbox policy': 'Sandbox' },
      claude: {
        'Legacy history and attached CLI access': 'Earlier Claude history',
        'Allow native home tools': 'Let Claude use home tools',
        'Keep native link installed': 'Keep home tools link',
        'Native link': 'Home tools link',
        'Live native sessions': 'Open Claude sessions',
        'Native harness tools': 'Claude’s tools',
        'Run native tool': 'Run tool',
        'Install or repair native link': 'Install or repair link',
        'Remove native link': 'Remove link',
      },
      'claude-sessions': {
        'Owned CLI sessions': 'Claude sessions',
        'Legacy native history': 'Earlier Claude history',
      },
      'claude-provider': {
        'Permission mode': 'Access',
        'Native MCP servers': 'Claude’s MCP servers',
        'Add native MCP server': 'Add MCP server',
        'Native flag settings': 'Advanced settings',
        'All native settings': 'Advanced settings',
        'Persist provider session': 'Keep session',
        'Permission prompt host': 'Ask for approval on',
      },
    };
    for (const [id, names] of Object.entries(renamed)) {
      const current = pageOf(id);
      for (const [earlier, now] of Object.entries(names)) {
        expect(current, `${id}: ${earlier}`).toContain(now);
        expect(current, `${id}: ${earlier}`).not.toContain(earlier);
      }
    }
  });
});
