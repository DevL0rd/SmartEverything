import type { ReactNode } from 'react';
import { SwitchRow } from '../../../../../components/rows';
import { List } from '../../../../../components/section';
import type { SectionProps } from './section-types';
import { flowNodeOf } from './node-view';

export function OptionalLanes(section: SectionProps): ReactNode {
  const { view, env, actions } = section;
  const node = flowNodeOf(view);
  const names = view.kind?.scopes?.optional ?? [];
  if (node === undefined || names.length === 0) return null;
  return (
    <List>
      {names.map((name) => {
        const lane = node.scopes?.[name];
        const busy = (lane?.nodes.length ?? 0) > 0;
        return (
          <SwitchRow
            key={name}
            title={name === 'else' || name === 'default' ? 'Otherwise' : `Add ${name}`}
            {...(busy ? { subtitle: 'Remove the steps in this lane first.' } : {})}
            value={lane !== undefined}
            disabled={env.locked || busy}
            onChange={(on) => {
              actions.editRows(view.key, [
                on ? { t: 'scope.add', name } : { t: 'scope.remove', name },
              ]);
            }}
          />
        );
      })}
    </List>
  );
}
