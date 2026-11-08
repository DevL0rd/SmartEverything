import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_KINDS,
  type AutomationPluginKindRow,
  type PluginKindStatus,
} from '@smarteverything/domain';
import { pluginNotice, type PluginState } from './plugin-badge';

function row(status: PluginKindStatus): AutomationPluginKindRow {
  const base = ALL_NODE_KINDS.find((kind) => kind.id === 'notify.person');
  if (base === undefined) throw new Error('missing notify.person');
  return {
    kind_id: 'plugin.discord.send',
    owner: 'plugin:discord',
    version: '1',
    interface_hash: '0'.repeat(64),
    declaration: {
      ...base,
      id: 'plugin.discord.send',
      category: 'plugins',
      origin: { kind: 'plugin', id: 'discord', name: 'Discord', icon: 'plug', version: '1' },
    },
    status,
    updated: '2026-10-25T10:00:00.000Z',
  };
}

const RUNNING: PluginState = { enabled: true, status: 'running' };

describe('plugin badges', () => {
  it('shows nothing for a core step or a working plugin', () => {
    expect(pluginNotice(undefined, undefined)).toBeNull();
    expect(pluginNotice(row('active'), RUNNING)).toBeNull();
    expect(pluginNotice(row('active'), undefined)).toBeNull();
  });

  it('says the plugin is switched off when the owner turned it off', () => {
    expect(pluginNotice(row('off'), { enabled: false, status: 'disabled' })).toBe(
      'Discord is switched off',
    );
    expect(pluginNotice(row('active'), { enabled: false, status: 'disabled' })).toBe(
      'Discord is switched off',
    );
  });

  it('says so from the kind status alone when the plugin list is not visible', () => {
    expect(pluginNotice(row('off'), undefined)).toBe('Discord is switched off');
    expect(pluginNotice(row('retired'), undefined)).toBe('Discord is not installed');
  });

  it('names a crashed, signed out or unreachable plugin', () => {
    expect(pluginNotice(row('off'), { enabled: true, status: 'crashed' })).toBe(
      'Discord stopped working',
    );
    expect(pluginNotice(row('active'), { enabled: true, status: 'needs_auth' })).toBe(
      'Discord needs signing in again',
    );
    expect(pluginNotice(row('off'), RUNNING)).toBe('Discord is not reachable');
  });

  it('says when an installed plugin dropped the step', () => {
    expect(pluginNotice(row('retired'), RUNNING)).toBe('Discord no longer has this step');
  });
});
