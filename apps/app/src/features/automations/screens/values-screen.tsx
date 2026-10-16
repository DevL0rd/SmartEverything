import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AutomationValueRow } from '@smarteverything/domain';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { NavRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { Sheet } from '../../../components/sheet';
import { useRows } from '../../../store/selectors';
import { operateValue } from '../../../api/automation-runtime';
import { attempt } from '../data/actions';
import { defaultOperation, valueText } from '../model/value-content';
import { ValueOperationFields } from '../editor/value-operation-fields';

interface ValueOperationProps {
  readonly row: AutomationValueRow;
  readonly onClose: () => void;
}

function ValueOperation({ row, onClose }: ValueOperationProps): ReactNode {
  const [operation, setOperation] = useState(() => defaultOperation(row.content));
  const [busy, setBusy] = useState(false);
  return (
    <>
      <ValueOperationFields content={row.content} operation={operation} onChange={setOperation} />
      <Button
        label="Apply change"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void attempt('The Value didn’t change', () => operateValue(row.id, operation))
            .then((saved) => {
              if (saved) onClose();
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      />
      <Button
        label="Edit definition"
        variant="tonal"
        href={href.automationValue(row.id)}
        onPress={onClose}
      />
    </>
  );
}

interface ValueRowsProps {
  readonly rows: readonly AutomationValueRow[];
  readonly visible: readonly AutomationValueRow[];
  readonly onSelect: (id: string) => void;
}
function ValueRows({ rows, visible, onSelect }: ValueRowsProps): ReactNode {
  if (rows.length === 0)
    return (
      <EmptyState
        icon="customize"
        title="Remember something"
        body="Keep a number, duration, on/off state or ordered choice for your automations."
      />
    );
  if (visible.length === 0)
    return <EmptyState icon="search" title="No matching Values" body="Try another name." />;
  return (
    <List>
      {visible.map((row) => (
        <NavRow
          key={row.id}
          title={row.content.name}
          subtitle={row.content.kind}
          value={valueText(row.content)}
          onPress={() => {
            onSelect(row.id);
          }}
        />
      ))}
    </List>
  );
}

export function ValuesScreen(): ReactNode {
  const router = useRouter();
  const rows = useRows('automation_values');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const current = rows.find((row) => row.id === selected);
  const visible = rows.filter((row) =>
    row.content.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Screen
      maxWidth="reading"
      header={<PageHeader title="Values" />}
      primaryAction={{
        label: 'New Value',
        icon: 'plus',
        onPress: () => {
          router.push(href.automationValue('new'));
        },
      }}
    >
      <SearchField value={query} onChange={setQuery} placeholder="Find a Value" variant="field" />
      <ValueRows rows={rows} visible={visible} onSelect={setSelected} />
      <Sheet
        open={current !== undefined}
        title={current?.content.name ?? 'Value'}
        onClose={() => {
          setSelected(null);
        }}
        detents={['fit']}
      >
        {current === undefined ? null : (
          <ValueOperation
            key={current.id}
            row={current}
            onClose={() => {
              setSelected(null);
            }}
          />
        )}
      </Sheet>
    </Screen>
  );
}
