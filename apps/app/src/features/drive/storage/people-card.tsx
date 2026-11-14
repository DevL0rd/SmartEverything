import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import { ProfileAvatar } from '../../profiles';
import { useQuotaRequest } from '../settings/page-storage';
import { peopleCaptionOf, usageLineOf, type PersonUsage } from './usage-model';
import { UsageMeter } from './usage-meter';

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
        <Button
          label="Set quota"
          spoken={`Set the space limit for ${entry.person.name}`}
          icon="gauge"
          variant="tonal"
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

function PersonRow({ entry }: { readonly entry: PersonUsage }): ReactNode {
  const title = entry.you ? `${entry.person.name} (you)` : entry.person.name;
  return (
    <UsageMeter
      leading={<ProfileAvatar profile={entry.person} />}
      title={title}
      line={usageLineOf(entry.usage, entry.quota)}
      action={<SetQuota entry={entry} />}
    />
  );
}

export function PeopleCard({ people }: { readonly people: readonly PersonUsage[] }): ReactNode {
  if (people.length === 0) return null;
  return (
    <Card title="People" icon="users">
      <Text variant="footnote" tone="variant">
        {`${peopleCaptionOf(people)} · ${PEOPLE_NOTE}`}
      </Text>
      <View className="gap-5">
        {people.map((entry) => (
          <PersonRow key={entry.person.id} entry={entry} />
        ))}
      </View>
    </Card>
  );
}
