import { z } from 'zod';
import { ApiError } from '@smarteverything/domain';
import type { ConversationAuthority } from '../../harness/authority-contract';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';
const EFFECT = z.strictObject({
  profile_id: z.uuid(),
  authorities: SQL_JSON.pipe(z.array(z.uuid()).min(1)),
});
export type EffectKind = 'command' | 'schedule' | 'automation';
export class HarnessEffectsRepository {
  constructor(private readonly context: StoreContext) {}
  keep(kind: EffectKind, id: string, sources: readonly ConversationAuthority[]): void {
    if (sources.length === 0) return;
    const profile = sources[0]?.profile_id;
    if (profile === undefined || sources.some((source) => source.profile_id !== profile))
      throw new ApiError('forbidden', 'Queued effects cannot combine initiating profiles.');
    const prior = this.find(kind, id);
    if (prior !== undefined && prior.profile_id !== profile)
      throw new ApiError('forbidden', 'Queued effects cannot change initiating profile.');
    const authorities = [
      ...new Set([...(prior?.authorities ?? []), ...sources.map((source) => source.event_id)]),
    ];
    this.context.sql.run(
      'retain queued effect initiating authority',
      'insert into harness_effect_authorities(kind,id,profile_id,authorities) values($kind,$id,$profile,$authorities) on conflict(kind,id) do update set authorities=excluded.authorities',
      { kind, id, profile, authorities: jsonText(authorities) },
    );
  }
  find(kind: EffectKind, id: string): z.infer<typeof EFFECT> | undefined {
    return this.context.sql.get(
      EFFECT,
      'select profile_id,authorities from harness_effect_authorities where kind=$kind and id=$id',
      { kind, id },
    );
  }
  reauthorize(kind: EffectKind, id: string, profile: string): void {
    const prior = this.find(kind, id);
    if (prior === undefined) return;
    if (prior.profile_id !== profile)
      throw new ApiError(
        'forbidden',
        'Only the initiating profile can authorize this automation again.',
      );
    this.context.sql.run(
      'replace queued effect authority with explicit owner authorization',
      'delete from harness_effect_authorities where kind=$kind and id=$id',
      { kind, id },
    );
  }
}
