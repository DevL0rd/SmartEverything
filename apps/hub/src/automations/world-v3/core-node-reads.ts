import type { WorldReadDeps } from './deps';
import { eventReadHandlers } from './event-reads';
import { healthReadHandlers } from './health-reads';
import { laundryReadHandlers } from './laundry-reads';
import { phoneReadHandlers } from './phone-reads';
import type { ReadHandlers } from './read-port';
import { vacuumReadHandlers } from './vacuum-reads';

export function coreNodeReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    ...eventReadHandlers(deps),
    ...healthReadHandlers(deps),
    ...laundryReadHandlers(deps),
    ...phoneReadHandlers(deps),
    ...vacuumReadHandlers(deps),
  };
}
