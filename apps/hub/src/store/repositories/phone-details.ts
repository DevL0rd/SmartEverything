import {
  PHONE_DETAIL,
  PHONE_DETAIL_SECTION_NAMES,
  type PhoneDetail,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

const COLUMNS = PHONE_DETAIL_SECTION_NAMES.join(', ');

const STORED_SECTIONS = storedRow(z.record(z.string(), z.unknown()), {
  json: [...PHONE_DETAIL_SECTION_NAMES],
});

export class PhoneDetailsRepository {
  constructor(
    private readonly context: StoreContext,
    private readonly log: Logger,
  ) {}

  read(deviceId: string): PhoneDetail {
    const stored = this.context.sql.get(
      STORED_SECTIONS,
      `select ${COLUMNS} from phone_details where device_id = $deviceId`,
      { deviceId },
    );
    if (stored === undefined) return {};
    const readable: Record<string, unknown> = {};
    for (const name of PHONE_DETAIL_SECTION_NAMES) {
      const section = stored[name];
      if (section === null || section === undefined) continue;
      const parsed = PHONE_DETAIL.shape[name].safeParse(section);
      if (parsed.success) readable[name] = parsed.data;
      else this.log.warn('phone.detail_unreadable', { device: deviceId, section: name });
    }
    return PHONE_DETAIL.parse(readable);
  }

  merge(deviceId: string, parts: PhoneDetail): void {
    const sections = PHONE_DETAIL_SECTION_NAMES.flatMap((name) => {
      const section = parts[name];
      return section === undefined ? [] : [[name, jsonText(section)] as const];
    });
    const names = sections.map(([name]) => name);
    this.context.sql.run(
      'save the phone detail',
      `insert into phone_details (device_id, ${names.join(', ')})
       values ($deviceId, ${names.map((name) => `$${name}`).join(', ')})
       on conflict (device_id) do update set ${names.map((name) => `${name} = excluded.${name}`).join(', ')}`,
      { deviceId, ...Object.fromEntries(sections) },
    );
  }
}
