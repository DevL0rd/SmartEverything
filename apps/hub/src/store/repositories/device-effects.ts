import { z } from 'zod';
import {
  CAPABILITY_KEY,
  DEVICE_EFFECT,
  JSON_VALUE,
  type DeviceEffect,
  type DeviceEffectTarget,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const CONTROL = storedRow(
  z.strictObject({
    device_id: z.uuid(),
    capability: CAPABILITY_KEY,
    base: JSON_VALUE,
    resolved: JSON_VALUE,
    updated_at: z.iso.datetime({ offset: true }),
  }),
  { json: ['base', 'resolved'] },
);
const EFFECT = storedRow(DEVICE_EFFECT, { json: ['operation'] });
const POLICY = z.strictObject({ effect_policy: z.enum(['keep', 'cancel']) });
const CONTROL_KEY = z.strictObject({ device_id: z.uuid(), capability: CAPABILITY_KEY });
const EFFECT_COLUMNS =
  'id, operation, priority, ordinal as "order", run_id as runId, node_id as nodeId, expires_at as expiresAt';

export class DeviceEffectsRepository {
  constructor(private readonly context: StoreContext) {}
  list(): DeviceEffectTarget[] {
    return this.context.sql.all(CONTROL, 'select * from device_effect_controls').map((control) => ({
      ...control,
      effects: this.effects(control.device_id, control.capability),
    }));
  }
  find(deviceId: string, capability: string): DeviceEffectTarget | undefined {
    const control = this.context.sql.get(
      CONTROL,
      'select * from device_effect_controls where device_id=$deviceId and capability=$capability',
      { deviceId, capability },
    );
    return control === undefined
      ? undefined
      : { ...control, effects: this.effects(deviceId, capability) };
  }
  controlOf(
    effectId: string,
  ): { readonly device_id: string; readonly capability: string } | undefined {
    return this.context.sql.get(
      CONTROL_KEY,
      'select device_id, capability from device_effects where id=$effectId',
      { effectId },
    );
  }
  save(row: Omit<DeviceEffectTarget, 'updated_at'>): DeviceEffectTarget {
    return this.context.write(() => {
      const before = this.find(row.device_id, row.capability);
      const saved = { ...row, updated_at: this.context.now() };
      this.context.sql.run(
        'save a controlled device value',
        `insert into device_effect_controls(device_id,capability,base,resolved,updated_at)
        values($device_id,$capability,$base,$resolved,$updated_at)
        on conflict(device_id,capability) do update set base=excluded.base,resolved=excluded.resolved,updated_at=excluded.updated_at`,
        {
          device_id: saved.device_id,
          capability: saved.capability,
          base: jsonText(saved.base),
          resolved: jsonText(saved.resolved),
          updated_at: saved.updated_at,
        },
      );
      this.replaceEffects(saved);
      this.context.changed(
        'device_effect_targets',
        before === undefined ? 'INSERT' : 'UPDATE',
        saved,
        before ?? null,
      );
      return saved;
    });
  }
  clear(deviceId: string, capability: string): void {
    this.context.write(() => {
      const before = this.find(deviceId, capability);
      if (before === undefined) return;
      this.context.sql.run(
        'forget a controlled device value',
        'delete from device_effect_controls where device_id=$deviceId and capability=$capability',
        { deviceId, capability },
      );
      this.context.changed('device_effect_targets', 'DELETE', null, before);
    });
  }
  policy(commandId: string): 'keep' | 'cancel' {
    return found(
      this.context.sql.get(POLICY, 'select effect_policy from commands where id=$commandId', {
        commandId,
      }),
      'command',
      commandId,
    ).effect_policy;
  }
  private effects(deviceId: string, capability: string): DeviceEffect[] {
    return this.context.sql.all(
      EFFECT,
      `select ${EFFECT_COLUMNS} from device_effects where device_id=$deviceId and capability=$capability order by ordinal`,
      { deviceId, capability },
    );
  }
  private replaceEffects(target: DeviceEffectTarget): void {
    const keep = jsonText(target.effects.map((effect) => effect.id));
    this.context.sql.run(
      'drop ended temporary changes',
      'delete from device_effects where device_id=$deviceId and capability=$capability and id not in (select value from json_each($keep))',
      { deviceId: target.device_id, capability: target.capability, keep },
    );
    for (const effect of target.effects)
      this.context.sql.run(
        'keep a temporary change',
        `insert or ignore into device_effects(id,device_id,capability,operation,priority,ordinal,run_id,node_id,expires_at)
        values($id,$deviceId,$capability,$operation,$priority,$ordinal,$runId,$nodeId,$expiresAt)`,
        {
          id: effect.id,
          deviceId: target.device_id,
          capability: target.capability,
          operation: jsonText(effect.operation),
          priority: effect.priority,
          ordinal: effect.order,
          runId: effect.runId,
          nodeId: effect.nodeId,
          expiresAt: effect.expiresAt,
        },
      );
  }
}
