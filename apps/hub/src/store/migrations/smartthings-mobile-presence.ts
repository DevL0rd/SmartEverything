import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';

export function removeSmartThingsMobilePresence(sql: Sql): LogPayload {
  const removed = sql.run(
    'remove the SmartThings mobile presence devices the paired phones replace',
    `delete from devices
     where provider = 'smartthings' and json_extract(details, '$.integration') = 'MOBILE'`,
  );
  return { removed: removed };
}
