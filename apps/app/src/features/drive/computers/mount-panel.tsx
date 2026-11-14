import type { ReactNode } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import type { DesktopPlatform } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { SegmentBar } from '../../../components/charts';
import { CopyField } from '../../../components/copy-field';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { ProgressSteps } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import {
  setupCopyOf,
  setupOf,
  TIER_WORD,
  type MountSetup,
  type MountSummary,
} from './mount-summary';
import { basicLimitsOf, WINFSP_URL } from './placement-words';
import type { DesktopDriveView } from './this-computer';

const TILE_COLUMNS = { compact: 2, medium: 2, expanded: 2 } as const;

export function mountTilesOf(summary: MountSummary): readonly MetricItem[] {
  return [
    { key: 'open', label: 'Open now', value: count(summary.openFiles), unit: 'files' },
    {
      key: 'uploads',
      label: 'Waiting to upload',
      value: count(summary.pendingUploads),
      ...(summary.pendingUploads === 0
        ? { caption: 'Everything is on the Hub' }
        : { tone: 'info' }),
    },
  ];
}

function CacheBar({ summary }: { readonly summary: MountSummary }): ReactNode {
  return (
    <SegmentBar
      label="Mount cache on this computer"
      segments={[
        { label: 'Cached', value: summary.cacheBytes - summary.pinnedBytes, colour: 'primary' },
        { label: 'Kept offline', value: summary.pinnedBytes, colour: 'viz-4' },
      ]}
      size="thin"
      legend
      format={bytes}
    />
  );
}

function Stopped({
  summary,
  drive,
}: {
  readonly summary: MountSummary;
  readonly drive: DesktopDriveView;
}): ReactNode {
  if (summary.stopped === null) return null;
  return (
    <Banner
      tone={summary.stopped.status.state === 'failed' ? 'critical' : 'warning'}
      title="The mount stopped"
      body={summary.stopped.status.reason ?? 'The drive is not mounted right now.'}
      wrapBody
      action={{
        label: 'Again',
        icon: 'refresh',
        variant: 'tonal',
        loading: drive.busy,
        onPress: () => {
          drive.run({ kind: 'again' }, 'The mount did not start again');
        },
      }}
    />
  );
}

function SetupAction({
  setup,
  command,
}: {
  readonly setup: MountSetup;
  readonly command: string | null;
}): ReactNode {
  if (setup === 'fuse3') {
    return command === null ? (
      <Text variant="footnote" tone="variant">
        Install the fuse3 package with your system’s package manager.
      </Text>
    ) : (
      <CopyField label="Install command" value={command} />
    );
  }
  if (setup !== 'winfsp') return null;
  return (
    <View className="flex-row">
      <Button
        label="Open winfsp.dev"
        icon="externalLink"
        variant="tonal"
        onPress={() => {
          background(Linking.openURL(WINFSP_URL), 'url.open_failed');
        }}
      />
    </View>
  );
}

export function MountSetupSteps({
  platform,
  drive,
  summary,
}: {
  readonly platform: DesktopPlatform;
  readonly drive: DesktopDriveView;
  readonly summary: MountSummary;
}): ReactNode {
  const fuse = drive.state?.fuse ?? null;
  const setup = setupOf(platform, fuse, summary);
  if (setup === null) return null;
  const copy = setupCopyOf(setup);
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong">{copy.title}</Text>
      <Text variant="footnote" tone="variant">
        {copy.intro}
      </Text>
      <ProgressSteps steps={copy.steps} />
      <SetupAction setup={setup} command={fuse?.available === false ? fuse.command : null} />
      <Text variant="footnote" tone="variant">
        {summary.limits === null ? copy.limits : basicLimitsOf(summary.limits)}
      </Text>
    </View>
  );
}

function Header({ summary }: { readonly summary: MountSummary }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="body-strong" className="min-w-0 flex-1">
        Mounted on this computer
      </Text>
      {summary.tier === null ? null : (
        <Badge
          label={
            summary.readOnly ? `${TIER_WORD[summary.tier]} · read only` : TIER_WORD[summary.tier]
          }
          tone="primary"
        />
      )}
    </View>
  );
}

export function MountPanel({
  platform,
  summary,
  drive,
}: {
  readonly platform: DesktopPlatform;
  readonly summary: MountSummary;
  readonly drive: DesktopDriveView;
}): ReactNode {
  return (
    <View className="gap-3">
      {summary.placements.length === 0 ? null : (
        <View className="gap-3 rounded-md bg-surface-2 p-3">
          <Header summary={summary} />
          <Stopped summary={summary} drive={drive} />
          {summary.active ? <CacheBar summary={summary} /> : null}
          {summary.active ? (
            <MetricStrip items={mountTilesOf(summary)} columns={TILE_COLUMNS} />
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            <Button
              label="Clear cache"
              icon="eraser"
              variant="outlined"
              loading={drive.busy}
              spoken={`Clear the mount cache, ${plural(summary.placements.length, 'folder')}`}
              onPress={() => {
                drive.run({ kind: 'clear-cache' }, 'The cache was not cleared');
              }}
            />
          </View>
          {drive.problem === null ? null : (
            <Text variant="footnote" tone="critical">
              {drive.problem}
            </Text>
          )}
        </View>
      )}
      <MountSetupSteps platform={platform} drive={drive} summary={summary} />
    </View>
  );
}
