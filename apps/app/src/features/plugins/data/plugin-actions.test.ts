import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLUGIN_ROW } from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';
import { applyListChange } from '../../../store/live-reducers';
import { pluginKey } from '../../../queries/keys';

const updatePlugin = vi.fn();
const notify = vi.fn();
vi.mock('../../../api/plugin-admin', () => ({
  updatePlugin,
  removePlugin: vi.fn(),
  restartPlugin: vi.fn(),
}));
vi.mock('../../../components/toast-store', () => ({
  notify,
  notifyFailure:
    (message: string) =>
    (error: unknown): void => {
      notify({ message, error, tone: 'critical' });
    },
}));

const { changePlugin, savePlugin, switchTool } = await import('./plugin-actions');

const row = PLUGIN_ROW.parse({
  id: 'demo',
  manifest: {
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    description: 'A demo',
    publisher: 'Test',
    contributes: {
      settings: {
        city: { type: 'string', title: 'City' },
        key: { type: 'string', title: 'Key', secret: true },
      },
    },
  },
  source: 'local',
  location: null,
  enabled: true,
  trusted: true,
  status: 'running',
  status_detail: null,
  tool_switches: {},
  settings: { city: 'Paris' },
  secret_names: [],
  icon_url: null,
  installed_at: '2026-10-16T00:00:00.000Z',
  updated_at: '2026-10-16T00:00:00.000Z',
});

function storeWithRow(): EntityStore {
  const store = new EntityStore();
  store.update((state) =>
    applyListChange(state, 'plugins', {
      table: 'plugins',
      operation: 'INSERT',
      record: row,
      oldRecord: null,
    }),
  );
  return store;
}

function cityOf(store: EntityStore): unknown {
  return store.get().tables.plugins.byId[row.id]?.settings['city'];
}

beforeEach(() => {
  updatePlugin.mockReset();
  notify.mockReset();
});

describe('savePlugin', () => {
  it('rejects when the save fails so a sheet keeps what was typed', async () => {
    updatePlugin.mockRejectedValue(new Error('refused'));
    await expect(savePlugin(storeWithRow(), row, { settings: { key: 'x' } })).rejects.toThrow(
      'refused',
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it('resolves when the save works', async () => {
    updatePlugin.mockResolvedValue({ outcome: 'saved' });
    await expect(savePlugin(storeWithRow(), row, { enabled: true })).resolves.toBeUndefined();
  });

  it('shows a changed setting at once and puts it back when the Hub refuses it', async () => {
    const store = storeWithRow();
    updatePlugin.mockImplementationOnce(() => {
      expect(cityOf(store)).toBe('Rome');
      return Promise.reject(new Error('refused'));
    });
    await expect(savePlugin(store, row, { settings: { city: 'Rome' } })).rejects.toThrow('refused');
    expect(cityOf(store)).toBe('Paris');
  });

  it('never writes a secret into the shown settings', async () => {
    const store = storeWithRow();
    updatePlugin.mockImplementationOnce(() => {
      expect(store.get().tables.plugins.byId[row.id]?.settings).toEqual({ city: 'Paris' });
      return Promise.resolve({ outcome: 'saved' });
    });
    await savePlugin(store, row, { settings: { key: 'hidden' } });
  });
});

describe('changePlugin', () => {
  it('names the failed change in a toast and does not reject', async () => {
    updatePlugin.mockRejectedValue(new Error('refused'));
    await expect(
      changePlugin(storeWithRow(), row, { enabled: true }, 'Key wasn’t saved'),
    ).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Key wasn’t saved' }));
  });
});

describe('switchTool', () => {
  const tool = {
    name: 'lookup',
    title: 'Look up',
    description: 'Finds a thing',
    enabled: false,
    read_only: true,
    destructive: false,
    human_only: false,
  };

  it('turns the tool on in the list before the Hub answers and back when it refuses', async () => {
    const client = new QueryClient();
    client.setQueryData(pluginKey(row.id, 'tools'), [tool]);
    const seen: unknown[] = [];
    updatePlugin.mockImplementationOnce(() => {
      seen.push(client.getQueryData(pluginKey(row.id, 'tools')));
      return Promise.reject(new Error('refused'));
    });
    await switchTool(storeWithRow(), client, row, { tool, on: true });
    expect(seen).toEqual([[{ ...tool, enabled: true }]]);
    expect(client.getQueryData(pluginKey(row.id, 'tools'))).toEqual([tool]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Look up wasn’t changed' }),
    );
  });
});
