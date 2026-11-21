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
  constructor(private readonly store: Pick<Store, 'host'>) {}

  async report(caller: Caller, report: AndroidAppBuildReport, at: Date): Promise<void> {
    const client = androidClientOf(caller, 'report its own build');
    await this.store.host.call(
      'androidBuildObservations',
      'save',
      client.id,
      report,
      at.toISOString(),
    );
  }

  async recordOutcome(client: ClientRow, outcome: AppUpdateOutcome, at: Date): Promise<void> {
    if (client.platform !== 'android') return;
    const saved = await this.store.host.call('androidBuildObservations', 'saveOutcome', client.id, {
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

  async read(client: ClientRow): Promise<AndroidAppObservation | null> {
    if (client.platform !== 'android') {
      throw new ApiError('invalid_request', 'This paired device does not run Android.');
    }
    return await this.store.host.call('androidBuildObservations', 'read', client.id);
  }

  async paired(clients: readonly ClientRow[]): Promise<readonly PairedAndroidBuild[]> {
    const android = clients.filter((client) => client.platform === 'android');
    const observed = await Promise.all(android.map((client) => this.read(client)));
    return android.flatMap((client, at) => {
      const observation = observed[at];
      return observation === null || observation === undefined
        ? []
        : [{ clientId: client.id, observation }];
    });
  }
}
