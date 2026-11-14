import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { initialsOf } from '../../../format/text';
import { clock } from '../../../format/time';
import { useSettings } from '../../../store/selectors';
import { useDriveRoots } from '../data';
import { driveLocationHref } from '../model/section-routes';
import {
  SERIES_LOOK,
  VIA_LOOK,
  badgeOf,
  sentenceOf,
  seriesOf,
  targetOf,
  type ActivityEntry,
} from './via-model';

export interface ActivityRowProps {
  readonly entry: ActivityEntry;
  readonly me: string | null;
}

type Mark = { readonly initials: string } | { readonly icon: IconName };

export function markOf(entry: ActivityEntry, me: string | null): Mark {
  const series = seriesOf(entry.row, me);
  const person = series === 'you' || series === 'people';
  if (person && entry.actorName !== null) return { initials: initialsOf(entry.actorName) };
  return { icon: VIA_LOOK[entry.row.via].icon };
}

function Avatar({
  entry,
  me,
  pointer,
}: {
  readonly entry: ActivityEntry;
  readonly me: string | null;
  readonly pointer: boolean;
}): ReactNode {
  const mark = markOf(entry, me);
  return (
    <View
      aria-hidden
      className={cn(
        'items-center justify-center rounded-full',
        pointer ? 'size-8' : 'size-10',
        SERIES_LOOK[seriesOf(entry.row, me)].fill,
      )}
    >
      {'initials' in mark ? (
        <Text variant="label" tone="onPrimary">
          {mark.initials}
        </Text>
      ) : (
        <Icon name={mark.icon} size={pointer ? 16 : 20} tone="onPrimary" />
      )}
    </View>
  );
}

export const ActivityRow = memo(function ActivityRow({ entry, me }: ActivityRowProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const zone = useSettings().time_zone;
  const time = clock(entry.row.at, zone);
  const sentence = sentenceOf(entry, me);
  const badge = badgeOf(entry);
  const target = targetOf(entry);
  const roots = useDriveRoots();
  return (
    <Interactive
      href={driveLocationHref(roots, target)}
      label={`${time}, ${sentence}, in ${entry.folderPath}, ${badge}`}
      className="h-row-h-2 flex-row items-center gap-3 px-4"
    >
      {pointer ? (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular w-11">
          {time}
        </Text>
      ) : null}
      <Avatar entry={entry} me={me} pointer={pointer} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body" numberOfLines={1}>
          {sentence}
        </Text>
        <Text variant="callout" tone="variant" ellipsize="middle">
          {pointer ? entry.folderPath : `${time} · ${entry.folderPath}`}
        </Text>
      </View>
      <View className="shrink-0">
        <Badge label={badge} />
      </View>
    </Interactive>
  );
});
