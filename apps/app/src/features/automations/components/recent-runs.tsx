import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AutomationRunRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { List } from '../../../components/section';
import { useMinute } from '../../../store/clock';
import { useRows } from '../../../store/selectors';
import { newestRuns } from '../model/run-history';
import { OwnedRunSheet, RunItem, useZone } from './owned-runs';

export function RecentRuns({ count }: { readonly count: number }): ReactNode {
  const rows = useRows('automation_runs');
  const automations = useRows('automations');
  const zone = useZone();
  const now = useMinute();
  const [selected, setSelected] = useState<AutomationRunRow | null>(null);
  const recent = newestRuns(rows, count);
  if (recent.length === 0) return null;
  const names = new Map(automations.map((item) => [item.id, item.name]));
  return (
    <>
      <List
        title="Recent runs"
        inset
        action={<Button label="See all" variant="text" href={href.automationRuns()} />}
      >
        {recent.map((row) => (
          <RunItem
            key={row.id}
            row={row}
            name={names.get(row.automation_id) ?? 'Deleted automation'}
            zone={zone}
            now={now}
            onOpen={setSelected}
          />
        ))}
      </List>
      <OwnedRunSheet
        run={selected}
        onClose={() => {
          setSelected(null);
        }}
      />
    </>
  );
}
