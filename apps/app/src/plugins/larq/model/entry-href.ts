import type { AppHref } from '../../../components/app-href';
import { href } from '../../../app-shell/hrefs';

const HYDRATION = 'Hydration';

export function drinkEntryHref(entryId: string): AppHref {
  return href.logHealth(HYDRATION, { entry: entryId });
}
