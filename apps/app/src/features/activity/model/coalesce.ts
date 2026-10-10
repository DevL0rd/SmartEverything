import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { plural } from '../../../format/text';
import type { ActivityAtom, ActivityCategory } from './atoms';
import { runsOf, type Run } from './grouping';

export interface ActivityItem {
  readonly id: string;
  readonly at: string;
  readonly since: string;
  readonly deviceId: string | null;
  readonly name: string;
  readonly summary: string;
  readonly by: string | null;
  readonly icon: IconName;
  readonly tone: Tone;
  readonly category: ActivityCategory;
  readonly count: number;
  readonly failed: boolean;
}

const TOPICS_SHOWN = 3;

function summaryOf(atoms: readonly ActivityAtom[], latest: ActivityAtom): string {
  if (atoms.length === 1) {
    return latest.what;
  }
  const topics = [...new Set(atoms.map((atom) => atom.topic))];
  if (topics.length === 1) {
    return latest.kind === 'command'
      ? `${latest.what} · ${plural(atoms.length, 'change')}`
      : `${latest.what} · ${String(atoms.length)} times`;
  }
  const shown = topics.slice(0, TOPICS_SHOWN).join(', ');
  const more = topics.length > TOPICS_SHOWN ? ' and more' : '';
  return `${plural(atoms.length, 'change')} · ${shown}${more}`;
}

function itemOf(run: Run<ActivityAtom>): ActivityItem | null {
  const [latest] = run.items;
  if (latest === undefined) {
    return null;
  }
  const failed = run.items.some((atom) => atom.failed);
  return {
    id: latest.id,
    at: latest.at,
    since: run.oldest,
    deviceId: latest.deviceId,
    name: latest.name,
    summary: summaryOf(run.items, latest),
    by: latest.by,
    icon: failed ? 'alert' : latest.icon,
    tone: failed ? 'critical' : latest.tone,
    category: latest.category,
    count: run.items.length,
    failed,
  };
}

export function coalesce(atoms: readonly ActivityAtom[]): readonly ActivityItem[] {
  const sorted = [...atoms].sort((left, right) => right.at.localeCompare(left.at));
  const runs = runsOf(
    sorted,
    (atom) => atom.group,
    (atom) => atom.at,
  );
  return runs.flatMap((run) => {
    const item = itemOf(run);
    return item === null ? [] : [item];
  });
}
