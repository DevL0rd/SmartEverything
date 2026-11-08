import { background } from '@smarteverything/logging';
import type { BackupRunner } from './runner';
import type { BackupPorts } from './ports';

export interface AppStateSource {
  subscribe(listener: (active: boolean) => void): () => void;
}

export function attachBackupTriggers(
  runner: BackupRunner,
  ports: BackupPorts,
  appState: AppStateSource,
): () => void {
  const request = (): void => {
    background(runner.request(), 'backup.request_failed');
  };
  const conditions = (): void => {
    background(runner.conditionsChanged(), 'backup.conditions_failed');
  };
  const settings = (): void => {
    background(runner.settingsChanged(), 'backup.settings_failed');
  };
  const offs = [
    ports.media.onChange(request),
    ports.conditions.subscribe(conditions),
    ports.settings.subscribe(settings),
    appState.subscribe((active) => {
      if (active) request();
    }),
  ];
  request();
  return (): void => {
    for (const off of offs) off();
  };
}
