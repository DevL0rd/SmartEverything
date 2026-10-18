import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { AutomationRow, AutomationV2 } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { usePendingKeys } from '../../../components/deferred-action';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { NavRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { plural } from '../../../format/text';
import { automationKey } from '../data/actions';
import { useCatalog } from '../data/use-automations';
import { isReusable, storedAutomationOf } from '../model/reusable-steps';

function useReusableRows(): readonly { row: AutomationRow; automation: AutomationV2 }[] {
  const automations = useCatalog().automations;
  const pending = usePendingKeys();
  return automations.flatMap((row) => {
    const automation = storedAutomationOf(row);
    return automation !== null && isReusable(automation) && !pending.has(automationKey(row.id))
      ? [{ row, automation }]
      : [];
  });
}

export function SequencesScreen(): ReactNode {
  const router = useRouter();
  const rows = useReusableRows();
  const [query, setQuery] = useState('');
  const visible = rows.filter((entry) =>
    entry.row.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Screen
      maxWidth="reading"
      header={<PageHeader title="Reusable steps" />}
      primaryAction={{
        label: 'New reusable steps',
        icon: 'plus',
        onPress: () => {
          router.push(href.automationSequence('new'));
        },
      }}
    >
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Find reusable steps"
        variant="field"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Make reusable steps"
          body="Give a set of steps a name, add inputs and run it from any automation."
          action={<Button label="New reusable steps" href={href.automationSequence('new')} />}
        />
      ) : (
        <List>
          {visible.map(({ row, automation }) => (
            <NavRow
              key={row.id}
              title={row.name}
              subtitle={`${plural(automation.steps.length, 'step')} · ${plural(automation.inputs?.length ?? 0, 'input')}`}
              icon="layers"
              href={href.automationSequence(row.id)}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}
