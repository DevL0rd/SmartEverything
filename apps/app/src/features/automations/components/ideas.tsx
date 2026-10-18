import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { useDeviceIcon } from '../editor/kinds';
import { IdeaRows } from './new-automation';
import type { Template } from '../model/templates';

const SHOWN = 3;

function IdeaCard({ idea }: { readonly idea: Template }): ReactNode {
  const iconOf = useDeviceIcon();
  return (
    <Card href={href.automation('new', idea.id)} label={idea.title}>
      <View className="size-10 items-center justify-center rounded-full bg-primary-container">
        <Icon name={iconOf(idea.deviceId)} size={20} tone="primary" />
      </View>
      <View className="gap-1">
        <Text variant="body-strong" numberOfLines={2}>
          {idea.title}
        </Text>
        <Text variant="callout" tone="variant" numberOfLines={2}>
          {idea.why}
        </Text>
      </View>
    </Card>
  );
}

function IdeaGrid({ ideas }: { readonly ideas: readonly Template[] }): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant" className="px-4">
        Ideas for your devices
      </Text>
      <Grid minItemWidth={200}>
        {ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </Grid>
    </View>
  );
}

function IdeasBlock({ ideas }: { readonly ideas: readonly Template[] }): ReactNode {
  const router = useRouter();
  const { width, height } = useSizeClass();
  if (ideas.length === 0) {
    return null;
  }
  if (width !== 'compact' && height !== 'compact') {
    return <IdeaGrid ideas={ideas} />;
  }
  return (
    <IdeaRows
      ideas={ideas}
      onPick={(idea) => {
        router.push(href.automation('new', idea.id));
      }}
    />
  );
}

export function FirstRun({ ideas }: { readonly ideas: readonly Template[] }): ReactNode {
  const { width, height } = useSizeClass();
  const compact = width === 'compact' || height === 'compact';
  return (
    <View className="gap-section-gap">
      <EmptyState
        compact={compact}
        icon="automations"
        title="Automate your home"
        body="Let things happen on their own, at a set time or when something changes."
        action={<Button label="New automation" icon="plus" href={href.automation('new')} />}
      />
      <IdeasBlock ideas={ideas.slice(0, SHOWN)} />
    </View>
  );
}
