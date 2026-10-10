import {
  COMPUTER_SCOPES,
  DEFAULT_COMPUTER_SCOPES,
  type ComputerScopes,
  type ComputerScopesPatch,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const STORED = z.strictObject({ scopes: SQL_JSON.pipe(COMPUTER_SCOPES.partial()) });

export class ComputerScopesRepository {
  constructor(private readonly context: StoreContext) {}

  read(deviceId: string): ComputerScopes {
    const row = this.context.sql.get(
      STORED,
      'select scopes from computer_scopes where device_id = $deviceId',
      { deviceId },
    );
    if (row === undefined) {
      return DEFAULT_COMPUTER_SCOPES;
    }
    return COMPUTER_SCOPES.parse({ ...DEFAULT_COMPUTER_SCOPES, ...row.scopes });
  }

  update(deviceId: string, patch: ComputerScopesPatch): ComputerScopes {
    return this.context.write(() => {
      const scopes = COMPUTER_SCOPES.parse({ ...this.read(deviceId), ...patch });
      this.context.sql.run(
        'save the computer permissions',
        `insert into computer_scopes (device_id, scopes, updated_at)
         values ($deviceId, $scopes, $updatedAt)
         on conflict (device_id) do update set scopes = excluded.scopes, updated_at = excluded.updated_at`,
        { deviceId, scopes: jsonText(scopes), updatedAt: this.context.now() },
      );
      return scopes;
    });
  }
}
