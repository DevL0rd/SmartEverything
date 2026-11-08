import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_BACKUP_STATUS, backupStatus } from '../model/status';
import { rig, rowOf, type Rig } from './fixtures';
import { attachBackupTriggers, type AppStateSource } from './triggers';

class FakeAppState implements AppStateSource {
  readonly listeners = new Set<(active: boolean) => void>();

  subscribe(listener: (active: boolean) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  emit(active: boolean): void {
    for (const listener of this.listeners) listener(active);
  }
}

async function idle(t: Rig): Promise<void> {
  await t.runner.whenIdle();
}

describe('backup triggers', () => {
  let t: Rig;
  let appState: FakeAppState;

  beforeEach(() => {
    backupStatus.set(INITIAL_BACKUP_STATUS);
    t = rig();
    appState = new FakeAppState();
  });

  it('runs once when attached and again on each library change', async () => {
    t.library.rows = [rowOf('a', 1000)];
    const detach = attachBackupTriggers(t.runner, t.ports, appState);
    await idle(t);
    expect(t.upload.started).toHaveLength(1);
    t.library.rows.push(rowOf('b', 2000));
    t.library.emitChange();
    await idle(t);
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'b']);
    detach();
  });

  it('runs when the app comes to the foreground but not when it leaves', async () => {
    const detach = attachBackupTriggers(t.runner, t.ports, appState);
    await idle(t);
    t.library.rows = [rowOf('a', 1000)];
    appState.emit(false);
    await idle(t);
    expect(t.upload.started).toHaveLength(0);
    appState.emit(true);
    await idle(t);
    expect(t.upload.started).toHaveLength(1);
    detach();
  });

  it('continues when the network stops being metered', async () => {
    t.conditions.current = { connected: true, wifi: true, metered: true, charging: true };
    t.library.rows = [rowOf('a', 1000)];
    const detach = attachBackupTriggers(t.runner, t.ports, appState);
    await idle(t);
    expect(backupStatus.get().pauseReason).toBe('wifi');
    t.conditions.change({ metered: false });
    await t.runner.conditionsChanged();
    await idle(t);
    expect(t.upload.started).toHaveLength(1);
    detach();
  });

  it('stops listening once detached', async () => {
    const detach = attachBackupTriggers(t.runner, t.ports, appState);
    await idle(t);
    detach();
    expect(t.library.listeners.size).toBe(0);
    expect(t.conditions.listeners.size).toBe(0);
    expect(t.settings.listeners.size).toBe(0);
    expect(appState.listeners.size).toBe(0);
  });
});
