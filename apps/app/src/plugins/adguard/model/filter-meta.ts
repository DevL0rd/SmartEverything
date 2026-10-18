import type { AdGuardFilter } from '@smarteverything/domain';
import { count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';

export function filterMeta(filter: AdGuardFilter, now: number): string {
  return joinParts([
    `${count(filter.rules)} rules`,
    filter.updatedAt === null ? null : `updated ${moment(filter.updatedAt, now)}`,
  ]);
}
