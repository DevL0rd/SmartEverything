import { z } from 'zod';
import {
  DEVICE_EFFECT_TARGET,
  DEVICE_EFFECT_RESOLUTION,
  type DeviceEffectTarget,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_TARGET = storedRow(DEVICE_EFFECT_TARGET, { json: ['base', 'resolved', 'effects'] });
const STORED_RESOLUTION = storedRow(DEVICE_EFFECT_RESOLUTION, {
  flags: ['generated'],
  json: ['base', 'value', 'effectIds'],
});
const POLICY = z.strictObject({ effect_policy: z.enum(['keep', 'cancel']) });
export class DeviceEffectsRepository {
  constructor(private readonly context: StoreContext) {}
  list(): DeviceEffectTarget[] {
    return this.context.sql.all(STORED_TARGET, 'select * from device_effect_targets');
  }
  find(deviceId: string, capability: string): DeviceEffectTarget | undefined {
    return this.context.sql.get(
      STORED_TARGET,
      'select * from device_effect_targets where device_id=$deviceId and capability=$capability',
      { deviceId, capability },
    );
  }
  save(row: DeviceEffectTarget): DeviceEffectTarget {
    return this.context.write(() => {
      const before = this.find(row.device_id, row.capability);
      const saved = { ...row, updated_at: this.context.now() };
      this.context.sql.run(
        'save temporary device changes',
        `insert into device_effect_targets(device_id,capability,base,resolved,generation,effects,command_id,updated_at)
        values($device_id,$capability,$base,$resolved,$generation,$effects,$command_id,$updated_at)
        on conflict(device_id,capability) do update set base=excluded.base,resolved=excluded.resolved,generation=excluded.generation,effects=excluded.effects,command_id=excluded.command_id,updated_at=excluded.updated_at`,
        {
          ...saved,
          base: jsonText(saved.base),
          resolved: jsonText(saved.resolved),
          effects: jsonText(saved.effects),
        },
      );
      this.context.changed(
        'device_effect_targets',
        before === undefined ? 'INSERT' : 'UPDATE',
        saved,
        before ?? null,
      );
      return saved;
    });
  }
  command(commandId: string): z.infer<typeof DEVICE_EFFECT_RESOLUTION> | undefined {
    return this.context.sql.get(
      STORED_RESOLUTION,
      'select command_id,device_id,capability,generation,generated,base,value,effect_ids as effectIds from device_effect_commands where command_id=$commandId',
      { commandId },
    );
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
  resolution(resolution: z.infer<typeof DEVICE_EFFECT_RESOLUTION>): void {
    this.context.sql.run(
      'record resolved device command',
      `insert into device_effect_commands(command_id,device_id,capability,generation,generated,base,value,effect_ids)
      values($command_id,$device_id,$capability,$generation,$generated,$base,$value,$effectIds) on conflict(command_id) do update set generation=excluded.generation,base=excluded.base,value=excluded.value,effect_ids=excluded.effect_ids`,
      {
        ...resolution,
        generated: Number(resolution.generated),
        base: jsonText(resolution.base),
        value: jsonText(resolution.value),
        effectIds: jsonText(resolution.effectIds),
      },
    );
  }
}
