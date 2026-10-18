import type { ReactNode } from 'react';
import { useState } from 'react';
import type { PersonAccess } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { SwitchRow, SelectRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import { useMinute } from '../../../store/clock';
import type { AccessActions } from '../data/access-data';
import { END_PRESETS, endAfter, endsText, windowText } from '../model/standing';
import { PausedWindowSheet } from './paused-window-sheet';

const NEVER = 'never';

const END_OPTIONS = [
  { value: NEVER, label: 'Never' },
  ...END_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
];

interface RowProps {
  readonly access: PersonAccess;
  readonly actions: AccessActions;
}

export function EndsRow({ access, actions }: RowProps): ReactNode {
  const now = useMinute();
  return (
    <SelectRow
      title="Access ends"
      subtitle="Pick a new time to give more time"
      wrapSubtitle
      icon="timer"
      options={END_OPTIONS}
      value={null}
      placeholder={endsText(access.expires_at, now)}
      onChange={(choice) => {
        const preset = END_PRESETS.find((entry) => entry.id === choice);
        const expires_at = preset === undefined ? null : endAfter(now, preset.ms);
        actions
          .change(access.profile_id, { expires_at })
          .catch(notifyFailure('The end time was not saved'));
      }}
    />
  );
}

export function HomeOnlyRow({ access, actions }: RowProps): ReactNode {
  return (
    <SwitchRow
      title="Home network only"
      subtitle="Refused when they connect from outside the house"
      wrapSubtitle
      icon="home"
      value={access.conditions.home_only}
      onChange={(home_only) => {
        actions
          .change(access.profile_id, { conditions: { ...access.conditions, home_only } })
          .catch(notifyFailure('The home network limit was not saved'));
      }}
    />
  );
}

export function PausedRow({ access, actions }: RowProps): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title="Paused hours"
        subtitle="Hours when this person cannot use the home"
        wrapSubtitle
        icon="moon"
        value={windowText(access.conditions.schedule)}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <PausedWindowSheet
          key={access.updated_at}
          access={access}
          actions={actions}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function RevokeRow({
  access,
  name,
  actions,
}: RowProps & { readonly name: string }): ReactNode {
  return (
    <ListRow
      title={`End ${name}'s access now`}
      subtitle="Their phones and chat accounts stop working at once. The person and their data stay."
      wrapSubtitle
      icon="trash"
      destructive
      onPress={() => {
        background(
          confirm({
            title: `End the access of ${name}?`,
            body: 'Their phones are unpaired and their chat accounts stop working right away. Pick a new end time to let them in again.',
            confirmLabel: 'End access',
            tone: 'destructive',
          }).then((yes) => {
            if (yes) {
              return actions
                .revoke(access.profile_id)
                .catch(notifyFailure('The access was not ended'));
            }
            return undefined;
          }),
          'person_access.revoke_failed',
        );
      }}
    />
  );
}
