import type { DriveSuggestion } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';
import { decodeCursor } from '../search';

const CURSOR = z.strictObject({ at: z.string(), itemId: z.string() });

export type SuggestionCursor = z.output<typeof CURSOR>;

export interface SuggestionPage {
  readonly items: readonly DriveSuggestion[];
  readonly next: string | null;
}

export class DriveSuggestions {
  constructor(private readonly store: Pick<Store, 'host'>) {}

  list(actor: DriveActor, cursor: string | undefined): Promise<SuggestionPage> {
    const after = cursor === undefined ? null : decodeCursor(CURSOR, cursor);
    return this.store.host.read('driveSuggestions', { actor, after });
  }
}
