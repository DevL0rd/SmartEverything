import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Grid } from '../../../components/grid';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useProgressiveCount } from '../../../design/progressive-count';
import { AutomationRow } from './automation-row';
import type { ListActions } from './list-actions';
import type { ListEntry } from './list-entries';
import type { ListLinks } from './list-links';
import type { Section } from './list-view';

export const ROWS_AT_ONCE = { first: 6, batch: 6 } as const;
const ROW_MIN_WIDTH = 520;

export function mountedIds(sections: readonly Section[], count: number): ReadonlySet<string> {
  return new Set(
    sections
      .flatMap((section) => section.entries)
      .slice(0, count)
      .map((entry) => entry.id),
  );
}

export interface SectionsProps {
  readonly sections: readonly Section[];
  readonly total: number;
  readonly iconOf: (entry: ListEntry) => IconName;
  readonly links: ListLinks;
  readonly actions: ListActions;
  readonly timeZone: string | null;
  readonly selectedId?: string | null;
}

export function Sections({
  sections,
  total,
  iconOf,
  links,
  actions,
  timeZone,
  selectedId = null,
}: SectionsProps): ReactNode {
  const count = useProgressiveCount(total, true, ROWS_AT_ONCE);
  const mounted = mountedIds(sections, count);
  return (
    <View className="gap-section-gap">
      {sections.map((section) => {
        const shown = section.entries.filter((entry) => mounted.has(entry.id));
        return shown.length === 0 ? null : (
          <View key={section.id} className="gap-2">
            <Text variant="label" tone="variant" accessibilityRole="header" className="px-1">
              {`${section.title} · ${String(section.entries.length)}`}
            </Text>
            <Grid minItemWidth={ROW_MIN_WIDTH} maxColumns={2}>
              {shown.map((entry) => (
                <AutomationRow
                  key={entry.id}
                  entry={entry}
                  icon={iconOf(entry)}
                  links={links}
                  actions={actions}
                  timeZone={timeZone}
                  selected={entry.id === selectedId}
                />
              ))}
            </Grid>
          </View>
        );
      })}
    </View>
  );
}
