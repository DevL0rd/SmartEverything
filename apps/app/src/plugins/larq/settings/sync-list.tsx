import type { BottleSettingsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { usePairedServer } from '../../../features/profiles';
import { useBottleAct } from '../data/bottle-act';
import { bringUpBottles } from '../data/link-host';
import { Anchored } from './anchored';

const OUTCOME: Readonly<Record<string, string>> = {
  ok: 'Synced',
  asleep: 'Asleep',
  disconnected: 'Dropped',
  refused: 'Refused',
  unreadable: 'Unreadable reply',
};

export function SyncList({ view }: { readonly view: BottleSettingsView }): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const now = useMinute();
  const paired = usePairedServer();
  const { holder } = view;
  return (
    <List
      inset
      title="Sync"
      footer="The phone that holds the bottle reads it each time it wakes and sends the drinks to your server."
    >
      <Anchored deviceId={view.deviceId} id="holder" label="Phone that syncs the bottle">
        <ValueRow
          icon="smartphone"
          title="Synced by"
          value={holder === null ? 'Nobody yet' : holder.isYou ? 'This phone' : holder.name}
        />
      </Anchored>
      {holder?.isYou === true ? null : (
        <Anchored deviceId={view.deviceId} id="take-over" label="Use this phone for the bottle">
          <ActionRow
            icon="refresh"
            title="Use this phone for the bottle"
            subtitle="This phone reads the bottle from now on"
            onPress={() => {
              act({ action: 'take_over' }, 'This phone could not take over', true, () => {
                if (paired !== null) {
                  bringUpBottles(paired.url, paired.token);
                }
              });
            }}
          />
        </Anchored>
      )}
      {view.syncs.slice(0, 5).map((sync) => (
        <ValueRow
          key={sync.startedAt}
          icon="clock"
          title={moment(sync.startedAt, now)}
          subtitle={sync.detail ?? `${String(sync.answered)} of ${String(sync.requests)} answers`}
          wrapSubtitle
          value={OUTCOME[sync.outcome] ?? sync.outcome}
        />
      ))}
    </List>
  );
}
