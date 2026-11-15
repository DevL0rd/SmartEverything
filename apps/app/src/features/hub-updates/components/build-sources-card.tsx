import type { ReactNode } from 'react';
import {
  RELEASE_ARTIFACTS,
  RELEASE_SOURCES,
  type BuildSourceSettings,
  type ReleaseArtifact,
  type ReleaseSource,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { Icon } from '../../../components/icon';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useBuildSources, useChangeBuildSources } from '../data/update-queries';
import { ARTIFACT_LOOK, SOURCE_DETAIL, SOURCE_LABEL } from '../model/update-copy';

const OPTIONS = RELEASE_SOURCES.map((value) => ({ value, label: SOURCE_LABEL[value] }));

type Change = ReturnType<typeof useChangeBuildSources>;

function choose(artifact: ReleaseArtifact, source: ReleaseSource, change: Change): void {
  if (source !== 'hub') {
    change.mutate({ [artifact]: source });
    return;
  }
  background(
    confirm({
      title: `Build the ${ARTIFACT_LOOK[artifact].name.toLowerCase()} on the hub?`,
      body: 'The hub machine runs the whole build for every release of this artifact. Provided builds and GitHub releases keep the hub free.',
      confirmLabel: 'Build on the hub',
    }).then((accepted) => {
      if (accepted) change.mutate({ [artifact]: source });
    }),
    'hub_update.build_source_confirm_failed',
  );
}

function SourceRow({
  artifact,
  sources,
  change,
}: {
  readonly artifact: ReleaseArtifact;
  readonly sources: BuildSourceSettings;
  readonly change: Change;
}): ReactNode {
  const look = ARTIFACT_LOOK[artifact];
  const source = sources[artifact];
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
      <View className="min-w-48 flex-1 flex-row items-center gap-2">
        <Icon name={look.icon} size={18} tone="variant" />
        <View className="min-w-0 flex-1">
          <Text variant="label">{look.name}</Text>
          <Text variant="footnote" tone={source === 'hub' ? 'warning' : 'variant'}>
            {SOURCE_DETAIL[source]}
          </Text>
        </View>
      </View>
      <Segmented
        label={`${look.name} build source`}
        options={OPTIONS}
        value={source}
        size="control"
        disabled={change.isPending}
        onChange={(next): void => {
          choose(artifact, next, change);
        }}
      />
    </View>
  );
}

export function BuildSourcesCard(): ReactNode {
  const sources = useBuildSources();
  const change = useChangeBuildSources();
  return (
    <Card title="Build sources" icon="package">
      {sources.data === undefined ? (
        <Text
          variant="callout"
          tone={sources.isError ? 'warning' : 'variant'}
          accessibilityLiveRegion="polite"
        >
          {sources.isError
            ? 'Couldn’t read where releases come from. Refresh when the hub is connected.'
            : 'Reading where each release comes from…'}
        </Text>
      ) : (
        <View className="gap-4">
          {RELEASE_ARTIFACTS.map((artifact) => (
            <SourceRow key={artifact} artifact={artifact} sources={sources.data} change={change} />
          ))}
        </View>
      )}
      {change.isError ? (
        <Text variant="callout" tone="warning" accessibilityLiveRegion="polite">
          Couldn’t change the build source. Nothing was changed.
        </Text>
      ) : null}
    </Card>
  );
}
