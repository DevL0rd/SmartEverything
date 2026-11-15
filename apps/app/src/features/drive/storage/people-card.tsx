import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import { ProfileAvatar } from '../../profiles';
import { useQuotaRequest } from '../settings/page-storage';
import { peopleCaptionOf, usageLineOf, type PersonUsage } from './usage-model';
import { UsageLegend, UsageMeter } from './usage-meter';

export const PEOPLE_NOTE =
  'Totals only · nobody sees the names or contents of another person’s drive';

function quotaBytesOf(entry: PersonUsage): number | null {
  return entry.quota.known ? entry.quota.bytes : null;
}

function SetQuota({ entry }: { readonly entry: PersonUsage }): ReactNode {
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const request = useQuotaRequest(
    { profileId: entry.person.id, name: entry.person.name, quota: quotaBytesOf(entry) },
    opener,
  );
  return (
    <>
      <View ref={opener} collapsable={false}>
        <IconButton
          icon="gauge"
          label={`Set the space limit for ${entry.person.name}`}
          onPress={() => {
            setOpen(true);
          }}
        />
      </View>
      <TextEditSheet
        request={open ? request : null}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function PersonRow({
  entry,
  freeBytes,
}: {
  readonly entry: PersonUsage;
  readonly freeBytes: number;
}): ReactNode {
  return (
    <UsageMeter
      leading={<ProfileAvatar profile={entry.person} />}
      title={entry.person.name}
      line={usageLineOf(entry.usage, entry.quota, freeBytes)}
      trailing={<SetQuota entry={entry} />}
    />
  );
}

export function PeopleCard({
  people,
  freeBytes,
}: {
  readonly people: readonly PersonUsage[];
  readonly freeBytes: number;
}): ReactNode {
  if (people.length === 0) return null;
  return (
    <Card title="People" icon="users">
      <Text variant="footnote" tone="variant">
        {`${peopleCaptionOf(people)} · ${PEOPLE_NOTE}`}
      </Text>
      <UsageLegend />
      <View className="gap-5">
        {people.map((entry) => (
          <PersonRow key={entry.person.id} entry={entry} freeBytes={freeBytes} />
        ))}
      </View>
    </Card>
  );
}
