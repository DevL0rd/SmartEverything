import {
  ApiError,
  type AndroidAppBuildReport,
  type AndroidAppObservation,
  type AppUpdateOutcome,
  type ClientRow,
  type PairedAndroidBuild,
} from '@smarteverything/domain';
import { directClient, type Caller } from '../server/auth';
import type { Store } from '../store/store';

function androidClientOf(caller: Caller, action: string): ClientRow {
  const client = directClient(caller);
  if (client?.platform !== 'android') {
    throw new ApiError('forbidden', `Only a paired Android app can ${action}.`);
  }
  return client;
}

export class AndroidBuilds {
  constructor(private readonly observations: Store['androidBuildObservations']) {}

  report(caller: Caller, report: AndroidAppBuildReport, at: Date): void {
    const client = androidClientOf(caller, 'report its own build');
    this.observations.save(client.id, report, at.toISOString());
  }

  recordOutcome(client: ClientRow, outcome: AppUpdateOutcome, at: Date): void {
    if (client.platform !== 'android') return;
    const saved = this.observations.saveOutcome(client.id, {
      ...outcome,
      recordedAt: at.toISOString(),
    });
    if (!saved) {
      throw new ApiError(
        'invalid_request',
        'Report the app build before reporting an update outcome.',
      );
    }
  }

  read(client: ClientRow): AndroidAppObservation | null {
    if (client.platform !== 'android') {
      throw new ApiError('invalid_request', 'This paired device does not run Android.');
    }
    return this.observations.read(client.id);
  }

  paired(clients: readonly ClientRow[]): readonly PairedAndroidBuild[] {
    return clients.flatMap((client) => {
      if (client.platform !== 'android') return [];
      const observation = this.read(client);
      return observation === null ? [] : [{ clientId: client.id, observation }];
    });
  }
}
