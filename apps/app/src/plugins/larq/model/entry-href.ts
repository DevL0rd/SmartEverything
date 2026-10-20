import type { Href } from 'expo-router';
import { href } from '../../../app-shell/hrefs';

const HYDRATION = 'Hydration';

export function drinkEntryHref(entryId: string): Href {
  return href.logHealth(HYDRATION, { entry: entryId });
}
