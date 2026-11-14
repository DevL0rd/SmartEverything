import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useUpdateRevisions } from '../data/update-queries';
import { revisionView } from '../model/revision-view';
import { PUSH_RELEASES_PAGE } from '../settings';
import { RevisionBody, RevisionHeader } from './revision-card';

function Newest(): ReactNode {
  const pipeline = useUpdateRevisions();
  const newest = pipeline.data?.revisions[0];
  if (pipeline.isError)
    return (
      <Text variant="callout" tone="warning">
        The pushed revisions couldn’t be loaded. Open Push releases to try again.
      </Text>
    );
  if (pipeline.data === undefined) return null;
  if (newest === undefined)
    return (
      <Text variant="callout" tone="variant">
        No pushes yet. Each push to the update branch releases what it changed.
      </Text>
    );
  const view = revisionView(newest);
  return (
    <View className="gap-3">
      <RevisionHeader view={view} />
      <RevisionBody view={view} />
    </View>
  );
}

function SetupBadge(): ReactNode {
  const push = useUpdateRevisions().data?.push;
  if (push === undefined) return <Icon name="chevronRight" size={20} tone="variant" />;
  return push.secretConfigured ? (
    <Badge label="Webhook set up" tone="positive" icon="circleCheck" />
  ) : (
    <Badge label="Webhook not set up" tone="warning" icon="warning" />
  );
}

export function PushReleasesCard(): ReactNode {
  return (
    <Card
      title="Push releases"
      icon="upload"
      href={href.settings.page(PUSH_RELEASES_PAGE)}
      label="Push releases, open every pushed revision and the webhook setup"
      metadata={<SetupBadge />}
    >
      <Newest />
    </Card>
  );
}
