import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { NavRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { useRows } from '../../../store/selectors';

export function SequencesScreen(): ReactNode {
  const router = useRouter();
  const rows = useRows('automation_sequences');
  const [query, setQuery] = useState('');
  const visible = rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <Screen
      maxWidth="reading"
      header={<PageHeader title="Sequences" />}
      primaryAction={{
        label: 'New sequence',
        icon: 'plus',
        onPress: () => {
          router.push(href.automationSequence('new'));
        },
      }}
    >
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Find a sequence"
        variant="field"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Make reusable steps"
          body="Give a set of actions a name, add typed parameters and call it from any automation."
          action={<Button label="New sequence" href={href.automationSequence('new')} />}
        />
      ) : (
        <List>
          {visible.map((row) => (
            <NavRow
              key={row.id}
              title={row.name}
              subtitle={`${String(row.definition.actions.length)} steps · ${String(row.definition.parameters.length)} parameters`}
              icon="layers"
              href={href.automationSequence(row.id)}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}
