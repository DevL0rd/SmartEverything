import type { PlannerExportLink } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { CopyField } from '../../../components/copy-field';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useExportLink, usePlannerFeeds } from '../data/feeds';
import { usePlannerFrame } from '../frame/frame-context';
import type { ViewerCalendar } from './calendars-model';
import { reachText } from './feeds-model';

type Busy = 'publish' | 'reset' | 'stop' | null;

interface LinkSteps {
  readonly busy: Busy;
  readonly run: (step: Exclude<Busy, null>) => void;
}

function useLinkSteps(calendar: ViewerCalendar): LinkSteps {
  const feeds = usePlannerFeeds(usePlannerFrame().person);
  const [busy, setBusy] = useState<Busy>(null);
  const id = calendar.row.id;
  const name = calendar.row.name;
  const work = async (step: Exclude<Busy, null>): Promise<void> => {
    if (step === 'stop') {
      await feeds.unpublish(id);
      return;
    }
    if (step === 'reset') {
      const yes = await confirm({
        title: 'Make a new feed address?',
        body: 'Apps that use the current address stop getting updates until they get the new one.',
        confirmLabel: 'Reset address',
      });
      if (!yes) return;
    }
    await feeds.publish(id);
  };
  return {
    busy,
    run: (step): void => {
      setBusy(step);
      work(step)
        .catch((error: unknown) => {
          notify({
            message: `The feed address of ${name} did not change`,
            error,
            tone: 'critical',
          });
        })
        .finally(() => {
          setBusy(null);
        });
    },
  };
}

function Published({
  link,
  steps,
}: {
  readonly link: PlannerExportLink;
  readonly steps: LinkSteps;
}): ReactNode {
  return (
    <View className="gap-2">
      <CopyField label="Feed address" value={link.url} />
      <Text variant="caption" tone="variant">
        {reachText(link)}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Reset address"
          icon="refresh"
          variant="outlined"
          loading={steps.busy === 'reset'}
          onPress={() => {
            steps.run('reset');
          }}
        />
        <Button
          label="Stop publishing"
          icon="ban"
          variant="text"
          loading={steps.busy === 'stop'}
          onPress={() => {
            steps.run('stop');
          }}
        />
      </View>
    </View>
  );
}

export function PublishRow({ calendar }: { readonly calendar: ViewerCalendar }): ReactNode {
  const { person } = usePlannerFrame();
  const link = useExportLink(person, calendar.row.id, true);
  const steps = useLinkSteps(calendar);
  if (link.data === undefined) return <Skeleton shape="line" />;
  if (link.data === null) {
    return (
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
        <Text variant="caption" tone="variant" className="min-w-48 flex-1">
          Publish a private address other calendar apps can subscribe to.
        </Text>
        <Button
          label="Publish feed address"
          icon="link"
          variant="tonal"
          loading={steps.busy === 'publish'}
          onPress={() => {
            steps.run('publish');
          }}
        />
      </View>
    );
  }
  return <Published link={link.data} steps={steps} />;
}
