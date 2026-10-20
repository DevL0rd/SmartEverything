import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { waterEntryOf, type HealthEntryRow } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entriesKey } from '../../queries/health-entries';

const api = vi.hoisted(() => ({
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  retryEntry: vi.fn(),
}));
interface Shown {
  readonly message: string;
  readonly action?: { readonly onPress: () => void };
}

const toast = vi.hoisted(() => ({ notify: vi.fn((_shown: Shown) => undefined) }));

vi.mock('../../api/nutrition', () => api);
vi.mock('../../components/toast-store', () => toast);

const { createMutation, entryMutationOptions, removeMutation, updateMutation } =
  await import('./entry-writes');

const FROM = Date.parse('2026-10-10T00:00:00Z');
const TO = Date.parse('2026-10-11T00:00:00Z');
const SPAN = {
  startTime: '2026-10-10T10:00:00.000Z',
  endTime: '2026-10-10T10:00:01.000Z',
  zoneOffsetSeconds: 0,
};
const OTHER_DAY = {
  ...SPAN,
  startTime: '2026-10-12T10:00:00.000Z',
  endTime: '2026-10-12T10:00:01.000Z',
};
const WINDOW = entriesKey(FROM, TO, '');
const ELSEWHERE = entriesKey(TO, TO + 86_400_000, '');

function row(id: string, start = SPAN.startTime): HealthEntryRow {
  return {
    id,
    profile_id: 'profile-1',
    record_type: 'Hydration',
    start_time: start,
    end_time: null,
    zone_offset_seconds: 0,
    data: { liters: 0.25 },
    food: null,
    version: 1,
    save_error: null,
    source: null,
    created_at: start,
    updated_at: start,
  };
}

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(WINDOW, [row('a')]);
  client.setQueryData(ELSEWHERE, []);
  return client;
}

function idsIn(client: QueryClient, key: readonly unknown[]): string[] {
  return (client.getQueryData<HealthEntryRow[]>(key) ?? []).map((entry) => entry.id);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('creating an entry', () => {
  it('shows the new row in the window it belongs to while the write is pending', async () => {
    const client = seeded();
    let finish: (saved: HealthEntryRow) => void = () => undefined;
    api.createEntry.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const observer = new MutationObserver(client, entryMutationOptions(client, createMutation));
    const pending = observer.mutate({ input: waterEntryOf(250, SPAN), done: 'Water logged' });
    await vi.waitFor(() => {
      expect(idsIn(client, WINDOW)).toHaveLength(2);
    });
    expect(idsIn(client, ELSEWHERE)).toEqual([]);
    finish(row('saved'));
    await pending;
    expect(toast.notify).toHaveBeenCalledWith({ message: 'Water logged', tone: 'positive' });
  });

  it('rolls every window back and says so when the write fails', async () => {
    const client = seeded();
    const failure = new Error('offline');
    api.createEntry.mockRejectedValue(failure);
    const observer = new MutationObserver(client, entryMutationOptions(client, createMutation));
    await expect(
      observer.mutate({ input: waterEntryOf(250, SPAN), done: 'Water logged' }),
    ).rejects.toThrow('offline');
    expect(idsIn(client, WINDOW)).toEqual(['a']);
    expect(idsIn(client, ELSEWHERE)).toEqual([]);
    expect(toast.notify).toHaveBeenCalledWith({
      message: 'Not logged',
      error: failure,
      tone: 'critical',
    });
  });

  it('refreshes the windows once the write settles', async () => {
    const client = seeded();
    api.createEntry.mockResolvedValue(row('saved'));
    const refresh = vi.spyOn(client, 'invalidateQueries');
    await new MutationObserver(client, entryMutationOptions(client, createMutation)).mutate({
      input: waterEntryOf(250, SPAN),
      done: '',
    });
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['window', 'health', 'entries'] });
    expect(toast.notify).not.toHaveBeenCalled();
  });
});

describe('changing an entry', () => {
  it('moves the row to the window its new time falls in, and back on failure', async () => {
    const client = seeded();
    let fail: (error: Error) => void = () => undefined;
    api.updateEntry.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
    const observer = new MutationObserver(client, entryMutationOptions(client, updateMutation));
    const attempt = observer.mutate({ before: row('a'), input: waterEntryOf(250, OTHER_DAY) });
    await vi.waitFor(() => {
      expect(idsIn(client, WINDOW)).toEqual([]);
    });
    expect(idsIn(client, ELSEWHERE)).toEqual([]);
    fail(new Error('offline'));
    await expect(attempt).rejects.toThrow('offline');
    expect(idsIn(client, WINDOW)).toEqual(['a']);
    expect(toast.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not changed' }));
  });
});

describe('removing an entry', () => {
  it('drops the row at once and offers Undo that logs it again', async () => {
    const client = seeded();
    api.deleteEntry.mockResolvedValue(undefined);
    const undo = vi.fn();
    const options = entryMutationOptions(client, removeMutation(undo));
    await new MutationObserver(client, options).mutate({ entry: row('a'), what: 'Water' });
    expect(idsIn(client, WINDOW)).toEqual([]);
    const shown = toast.notify.mock.calls[0]?.[0];
    expect(shown?.message).toBe('Water removed');
    shown?.action?.onPress();
    expect(undo).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('puts the row back when the delete fails', async () => {
    const client = seeded();
    api.deleteEntry.mockRejectedValue(new Error('offline'));
    const options = entryMutationOptions(client, removeMutation(vi.fn()));
    await expect(
      new MutationObserver(client, options).mutate({ entry: row('a'), what: 'Water' }),
    ).rejects.toThrow('offline');
    expect(idsIn(client, WINDOW)).toEqual(['a']);
    expect(toast.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not removed' }));
  });
});
