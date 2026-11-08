import type { ListeningSource, ListeningSuperseded } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../format/errors';
import { nameOf } from '../listening/contest-model';

const log = new Logger('app.phone-ear');

export async function announceSupersededBy(
  winner: ListeningSuperseded['winner'],
  readSources: () => Promise<readonly ListeningSource[]>,
  show: (by: string) => void,
): Promise<void> {
  try {
    show(nameOf(winner, await readSources()));
  } catch (error) {
    log.warn('phone_ear.superseded_names_failed', { reason: rawErrorText(error) });
    show(nameOf(winner, []));
  }
}
