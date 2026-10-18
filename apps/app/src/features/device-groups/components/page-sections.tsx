import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Section, SectionAction, List } from '../../../components/section';
import { NavRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { ActivityRow, useActivity } from '../../activity';
import type { AutomationUse } from '../model/automation-uses';

const ACTIVITY_SHOWN = 3;

export function ActivitySection({
  name,
  deviceIds,
}: {
  readonly name: string;
  readonly deviceIds: readonly string[];
}): ReactNode {
  const ids = useMemo(() => new Set(deviceIds), [deviceIds]);
  const items = useActivity({ deviceIds: ids }).slice(0, ACTIVITY_SHOWN);
  return (
    <Section title="Activity" action={<SectionAction label="See all" href={href.activity()} />}>
      <View
        role="list"
        aria-label={`Recent activity in ${name}`}
        className="rounded-lg border-hairline border-outline-variant bg-surface-1 px-2 py-1"
      >
        {items.length === 0 ? (
          <Text variant="footnote" tone="variant" className="px-2 py-3">
            No activity yet.
          </Text>
        ) : (
          items.map((item) => <ActivityRow key={item.id} item={item} withName flush />)
        )}
      </View>
    </Section>
  );
}

export function AutomationsSection({
  uses,
}: {
  readonly uses: readonly AutomationUse[];
}): ReactNode {
  if (uses.length === 0) return null;
  return (
    <List title={`Automations · ${String(uses.length)}`} inset>
      {uses.map((use) => (
        <NavRow
          key={use.id}
          title={use.name}
          subtitle={use.enabled ? 'On' : 'Paused'}
          icon="automations"
          href={href.automation(use.id)}
        />
      ))}
    </List>
  );
}
