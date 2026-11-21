import type { PlannerShareRole, ProfileRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useRows } from '../../../store/selectors';
import { ProfileAvatar } from '../../profiles';
import { usePlannerSharing, useViewerCalendars } from '../data/sharing';
import { usePlannerFrame } from '../frame/frame-context';
import { shareCandidatesOf, type ShareCandidate, type ViewerCalendar } from './calendars-model';

type Access = 'none' | PlannerShareRole;

const ACCESS: readonly SegmentedOption<Access>[] = [
  { value: 'none', label: 'Not shared' },
  { value: 'view', label: 'View', icon: 'eye' },
  { value: 'edit', label: 'Edit', icon: 'pencil' },
];

type Candidate = ShareCandidate<ProfileRow>;

function accessOf(candidate: Candidate): Access {
  return candidate.share?.role ?? 'none';
}

function PersonRow({
  calendar,
  candidate,
}: {
  readonly calendar: ViewerCalendar;
  readonly candidate: Candidate;
}): ReactNode {
  const sharing = usePlannerSharing(usePlannerFrame().person);
  const { person } = candidate;
  const choose = (next: Access): void => {
    if (next === accessOf(candidate)) return;
    const done =
      next === 'none'
        ? sharing.unshare(calendar, person.id)
        : sharing.share(calendar, person.id, next);
    done.catch((error: unknown) => {
      notify({
        message: `Sharing with ${person.name} did not change`,
        error,
        tone: 'critical',
      });
    });
  };
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <View className="min-w-24 flex-1 flex-row items-center gap-3">
        <ProfileAvatar profile={person} />
        <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
          {person.name}
        </Text>
      </View>
      <View className="ml-auto">
        <Segmented
          label={`${person.name} can`}
          options={ACCESS}
          value={accessOf(candidate)}
          onChange={choose}
          compact
        />
      </View>
    </View>
  );
}

export interface ShareSheetProps {
  readonly calendarId: string | null;
  readonly onClose: () => void;
}

export function ShareSheet({ calendarId, onClose }: ShareSheetProps): ReactNode {
  const { person } = usePlannerFrame();
  const people = useRows('profiles');
  const calendar = useViewerCalendars(person).find((entry) => entry.row.id === calendarId);
  const candidates = calendar === undefined ? [] : shareCandidatesOf(calendar, people);
  return (
    <Sheet
      open={calendar !== undefined}
      onClose={onClose}
      title={calendar === undefined ? 'Share' : `Share ${calendar.row.name}`}
      detents={['fit']}
      subpage
    >
      {calendar === undefined ? null : (
        <View className="gap-1 pb-2">
          <Text variant="caption" tone="variant" className="pb-1">
            People who can view see its events in their own Planner. People who can edit also add
            and change them.
          </Text>
          {candidates.length === 0 ? (
            <EmptyState
              icon="users"
              title="Nobody else at home yet"
              body="Add people in Settings to share this calendar with them."
            />
          ) : (
            candidates.map((candidate) => (
              <PersonRow key={candidate.person.id} calendar={calendar} candidate={candidate} />
            ))
          )}
        </View>
      )}
    </Sheet>
  );
}
