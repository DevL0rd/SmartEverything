import type { ReactNode } from 'react';
import type { ReleaseUpload } from '@smarteverything/domain';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useReleaseUploads } from '../data/update-queries';
import { ARTIFACT_LOOK, uploadLine, uploadProgress } from '../model/update-copy';

function UploadRow({ upload }: { readonly upload: ReleaseUpload }): ReactNode {
  const look = ARTIFACT_LOOK[upload.artifact];
  const now = useMinute();
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Icon name={look.icon} size={18} tone="variant" />
        <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
          {look.name}
        </Text>
        <View className="flex-1" />
        {upload.state === 'staged' ? (
          <Badge label="Staged" tone="positive" icon="circleCheck" />
        ) : (
          <Badge label="Receiving" tone="primary" icon="upload" />
        )}
      </View>
      <ProgressBar
        progress={uploadProgress(upload)}
        colour={upload.state === 'staged' ? 'positive' : 'primary'}
        label={`${look.name} upload`}
      />
      <Text variant="footnote" tone="variant" selectable className="web:wrap-anywhere">
        {`${uploadLine(upload)} · ${relative(upload.createdAt, now)}`}
      </Text>
    </View>
  );
}

export function StagedBuildsCard(): ReactNode {
  const uploads = useReleaseUploads();
  const list = uploads.data?.uploads;
  return (
    <Card title="Staged builds" icon="box">
      {list === undefined ? (
        <Text
          variant="callout"
          tone={uploads.isError ? 'warning' : 'variant'}
          accessibilityLiveRegion="polite"
        >
          {uploads.isError
            ? 'Couldn’t read the staged builds. Refresh when the hub is connected.'
            : 'Reading the staged builds…'}
        </Text>
      ) : list.length === 0 ? (
        <Text variant="callout" tone="variant">
          No builds are staged. A provided build shows here while it uploads and until it is
          published or discarded.
        </Text>
      ) : (
        <View className="gap-4">
          {list.map((upload) => (
            <UploadRow key={upload.uploadId} upload={upload} />
          ))}
        </View>
      )}
    </Card>
  );
}
