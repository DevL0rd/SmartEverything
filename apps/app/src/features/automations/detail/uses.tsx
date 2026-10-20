import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { RefNames } from '@smarteverything/domain';
import type { Manifest } from '@smarteverything/flow/compile/manifest';
import { Card } from '../../../components/card';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { dynamicUsage, usageGroups, type UseChip, type UseSlot } from './detail-model';

export type UseLink = (slot: UseSlot, id: string) => Href | null;

function Chip({ chip, link }: { readonly chip: UseChip; readonly link: UseLink }): ReactNode {
  const href = link(chip.slot, chip.id);
  return (
    <Interactive
      label={chip.label}
      {...(href === null ? {} : { href })}
      className={cn(
        'min-h-touch-min justify-center rounded-full bg-surface-3 px-3',
        href === null && 'opacity-90',
      )}
    >
      <Text variant="callout" numberOfLines={1}>
        {chip.label}
      </Text>
    </Interactive>
  );
}

export function Uses({
  manifest,
  names,
  link,
}: {
  readonly manifest: Manifest | null;
  readonly names: RefNames;
  readonly link: UseLink;
}): ReactNode {
  if (manifest === null) {
    return (
      <Card title="Uses" icon="link">
        <Text variant="body" tone="variant">
          What it uses is listed once it has no errors.
        </Text>
      </Card>
    );
  }
  const groups = usageGroups(manifest, names);
  const dynamic = dynamicUsage(manifest);
  return (
    <Card title="Uses" icon="link">
      {groups.length === 0 ? (
        <Text variant="body" tone="variant">
          It doesn’t use any devices, rooms or variables.
        </Text>
      ) : (
        groups.map((group) => (
          <View key={group.slot} className="gap-2">
            <Text variant="footnote" tone="variant" accessibilityRole="header">
              {group.title}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {group.chips.map((chip) => (
                <Chip key={chip.id} chip={chip} link={link} />
              ))}
            </View>
          </View>
        ))
      )}
      {dynamic.length === 0 ? null : (
        <Text variant="footnote" tone="variant">
          {`It also uses ${dynamic.join(', ')} chosen while it runs.`}
        </Text>
      )}
    </Card>
  );
}
