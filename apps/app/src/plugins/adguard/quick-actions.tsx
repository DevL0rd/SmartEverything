import { useMemo, type ReactNode } from 'react';
import { ListRow } from '../../components/list-row';
import type { MenuItem } from '../../components/menu';
import { List } from '../../components/section';
import { notify } from '../../components/toast-store';
import type { Device } from '../../store/state';
import { PluginActionRow } from '../shared/plugin-action';
import { useAdGuardSnapshot, useAdGuardTools } from './adguard-data';
import { adguardSectionHref } from './model/links';
import { PAUSE_CHOICES, pausedMessage, type PauseChoice } from './model/pause-model';
import { protectionOf } from './model/protection';

export interface AdGuardActions {
  readonly pauseFor: (choice: PauseChoice) => Promise<unknown>;
  readonly resume: () => Promise<unknown>;
}

export function useAdGuardActions(): AdGuardActions {
  const tools = useAdGuardTools();
  return useMemo(
    () => ({
      pauseFor: async (choice): Promise<unknown> => {
        const done = await tools.run(
          'pause_protection',
          { minutes: choice.minutes },
          'Ad blocking wasn’t paused',
        );
        if (done !== null) {
          notify({ message: pausedMessage(choice) });
        }
        return done;
      },
      resume: () => tools.run('resume_protection', {}, 'Ad blocking didn’t switch on'),
    }),
    [tools],
  );
}

export function pauseMenuItems(
  pauseFor: AdGuardActions['pauseFor'],
  run: (work: Promise<unknown>) => void,
): readonly MenuItem[] {
  return PAUSE_CHOICES.map((choice) => ({
    label: `For ${choice.spoken}`,
    icon: 'pause',
    onPress: (): void => {
      run(pauseFor(choice));
    },
  }));
}

export function AdGuardQuickActions({ device }: { readonly device: Device }): ReactNode {
  const actions = useAdGuardActions();
  const stream = useAdGuardSnapshot();
  const status = stream.state === 'ready' ? stream.value.status : null;
  const reachable = stream.state === 'ready' && stream.value.connection.state === 'online';
  const protecting = status !== null && protectionOf(status) === 'on';
  return (
    <List>
      {protecting ? (
        PAUSE_CHOICES.map((choice) => (
          <PluginActionRow
            key={choice.minutes}
            title={`Pause for ${choice.spoken}`}
            icon="pause"
            disabled={!reachable}
            onPress={() => actions.pauseFor(choice)}
          />
        ))
      ) : (
        <PluginActionRow
          title={status === null ? 'Turn on ad blocking' : 'Resume ad blocking'}
          icon="play"
          disabled={!reachable}
          onPress={actions.resume}
        />
      )}
      <ListRow
        title="Query log"
        icon="list"
        chevron
        href={adguardSectionHref(device.id, 'queries')}
      />
      <ListRow
        title="Block a domain…"
        icon="ban"
        chevron
        href={adguardSectionHref(device.id, 'filters')}
      />
    </List>
  );
}
