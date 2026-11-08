import {
  IR_APPLIANCE_KEY_ROW,
  IR_APPLIANCE_ROW,
  type IrApplianceKeyRow,
  type IrApplianceRow,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
import { InfraredRepository } from './infrared';

const APPLIANCE_COLUMNS = 'id, blaster_id, name, category, brand, encoder, created_at';
const KEY_COLUMNS = 'id, appliance_id, button, format, code, created_at';

export const LEARNED_ENCODER = 'learned';

export interface SavedKey {
  readonly button: string;
  readonly format: IrApplianceKeyRow['format'];
  readonly code: string;
}

export interface NewAppliance {
  readonly blasterId: string;
  readonly name: string;
  readonly category: string;
  readonly brand: string | null;
  readonly encoder: string;
  readonly keys: readonly SavedKey[];
}

export class IrAppliancesRepository {
  private readonly infrared: InfraredRepository;

  constructor(private readonly context: StoreContext) {
    this.infrared = new InfraredRepository(context);
  }

  list(): IrApplianceRow[] {
    return this.context.sql.all(
      IR_APPLIANCE_ROW,
      `select ${APPLIANCE_COLUMNS} from ir_appliances order by name, id`,
    );
  }

  find(id: string): IrApplianceRow | undefined {
    return this.context.sql.get(
      IR_APPLIANCE_ROW,
      `select ${APPLIANCE_COLUMNS} from ir_appliances where id = $id`,
      { id },
    );
  }

  byId(id: string): IrApplianceRow {
    return found(this.find(id), 'IR appliance', id);
  }

  keys(applianceId: string): IrApplianceKeyRow[] {
    return this.context.sql.all(
      IR_APPLIANCE_KEY_ROW,
      `select ${KEY_COLUMNS} from ir_appliance_keys where appliance_id = $applianceId order by button, id`,
      { applianceId },
    );
  }

  create(appliance: NewAppliance): IrApplianceRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the appliance',
        `insert into ir_appliances (id, blaster_id, name, category, brand, encoder, created_at)
         values ($id, $blasterId, $name, $category, $brand, $encoder, $now)`,
        {
          id,
          blasterId: appliance.blasterId,
          name: appliance.name,
          category: appliance.category,
          brand: appliance.brand,
          encoder: appliance.encoder,
          now: this.context.now(),
        },
      );
      appliance.keys.forEach((key) => {
        this.saveKey(id, key);
      });
      return this.byId(id);
    });
  }

  promote(remoteId: string): IrApplianceRow {
    return this.context.write(() => {
      const promoted = this.find(remoteId);
      if (promoted !== undefined) {
        return promoted;
      }
      const remote = this.infrared.remote(remoteId);
      this.context.sql.run(
        'add the appliance from the learned remote',
        `insert into ir_appliances (id, blaster_id, name, category, brand, encoder, created_at)
         values ($id, $blasterId, $name, $category, $brand, $encoder, $now)`,
        {
          id: remote.id,
          blasterId: remote.blaster_id,
          name: remote.name,
          category: remote.category,
          brand: remote.brand,
          encoder: LEARNED_ENCODER,
          now: this.context.now(),
        },
      );
      this.infrared
        .codes()
        .filter((code) => code.remote_id === remote.id)
        .forEach((code) => {
          this.saveKey(remote.id, code);
        });
      this.infrared.removeRemote(remote.id);
      return this.byId(remote.id);
    });
  }

  rebind(id: string, blasterId: string): IrApplianceRow {
    return this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'bind the appliance to another blaster',
        'update ir_appliances set blaster_id = $blasterId where id = $id',
        { id, blasterId },
      );
      return this.byId(id);
    });
  }

  saveKey(applianceId: string, key: SavedKey): IrApplianceKeyRow {
    return this.context.write(() => {
      this.byId(applianceId);
      this.context.sql.run(
        'save the appliance button code',
        `insert into ir_appliance_keys (id, appliance_id, button, format, code, created_at)
         values ($id, $applianceId, $button, $format, $code, $now)
         on conflict (appliance_id, button) do update set format = excluded.format, code = excluded.code`,
        {
          id: this.context.newId(),
          applianceId,
          button: key.button,
          format: key.format,
          code: key.code,
          now: this.context.now(),
        },
      );
      return found(
        this.keys(applianceId).find((saved) => saved.button === key.button),
        'IR appliance button',
        key.button,
      );
    });
  }

  remove(id: string): IrApplianceRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the appliance', 'delete from ir_appliances where id = $id', {
        id,
      });
      return before;
    });
  }
}
