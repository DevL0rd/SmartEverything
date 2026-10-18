import { z } from 'zod';
import type { StoreContext } from '../context';

const STORED_ICON = z.object({ webp: z.instanceof(Uint8Array) });

export class PhoneIconsRepository {
  constructor(private readonly context: StoreContext) {}

  find(hash: string): Uint8Array | undefined {
    return this.context.sql.get(STORED_ICON, 'select webp from phone_icons where hash = $hash', {
      hash,
    })?.webp;
  }

  save(hash: string, webp: Uint8Array): void {
    this.context.sql.run(
      'save the phone app icon',
      `insert into phone_icons (hash, webp, created_at) values ($hash, $webp, $now)
       on conflict (hash) do nothing`,
      { hash, webp, now: this.context.now() },
    );
  }
}
