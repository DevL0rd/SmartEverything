import { ApiError, type ClientRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { HomeMirror } from '../store/home-mirror';

type Device = Pick<ClientRow, 'id' | 'role'>;

const KEY = 'developer-devices';

const STORED = z.strictObject({ clients: z.array(z.string()) });

export class DeveloperDevices {
  constructor(private readonly saved: Pick<HomeMirror['saved'], 'read' | 'save'>) {}

  isDeveloper(client: Device): boolean {
    return client.role === 'owner' && this.clients().includes(client.id);
  }

  async set(client: Device, developer: boolean): Promise<boolean> {
    if (client.role !== 'owner') {
      throw new ApiError('forbidden', 'Only an owner’s device can be a developer device.');
    }
    const others = this.clients().filter((id) => id !== client.id);
    await this.saved.save(KEY, { clients: developer ? [...others, client.id] : others });
    return developer;
  }

  require(client: Device): void {
    if (!this.isDeveloper(client)) {
      throw new ApiError(
        'forbidden',
        'Raw watch files are for developer devices only; turn on Save raw watch files in the Developer page of a development build.',
      );
    }
  }

  private clients(): readonly string[] {
    const stored = this.saved.read(KEY);
    return stored === null ? [] : STORED.parse(stored).clients;
  }
}
