import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { MetricStrip } from '../../../components/metric-strip';
import { NavRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIsPhone } from '../../../design/size-class';
import { useMinute } from '../../../store/clock';
import { SkipPatterns } from '../computers/skip-patterns';
import { useDriveRescan, useDriveRootUpdate, useRootProgress } from '../data';
import {
  HIDDEN_NOTE,
  SKIP_FOOTER,
  VERSIONS_NOTE,
  damagedLineOf,
  driveStateLineOf,
  driveTilesOf,
  scanLineOf,
  type DriveSettingsCard,
} from './drive-card-model';
import { driveSettingsFocusHref } from './sections';

const TILE_COLUMNS = { compact: 3, medium: 3, expanded: 3 } as const;

function RescanButton({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  const rescan = useDriveRescan();
  if (!card.editable) return null;
  return (
    <Button
      label="Rescan"
      icon="refresh"
      variant="tonal"
      spoken={`Rescan ${card.label}`}
      loading={rescan.busy}
      disabled={card.root.state === 'scanning'}
      onPress={() => {
        rescan.run(card.root.id);
      }}
    />
  );
}

function ScanProgress({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  const line = scanLineOf(card.root, useRootProgress(card.root.id));
  if (line === null) return null;
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" className="tabular">
        {line.text}
      </Text>
      <ProgressBar progress={line.share} colour="info" label={line.text} />
    </View>
  );
}

function StateLine({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  const line = driveStateLineOf(card.root, useMinute());
  const stacked = useIsPhone();
  return (
    <View className="gap-3 px-4">
      <View className={cn('gap-2', stacked ? 'items-start' : 'flex-row flex-wrap items-center')}>
        <Badge label={line.text} tone={line.tone} />
        <Text variant="footnote" tone="variant" className={cn(!stacked && 'min-w-0 flex-1')}>
          {card.who}
        </Text>
      </View>
      <ScanProgress card={card} />
    </View>
  );
}

function OptionRow({
  title,
  icon,
  subtitle,
  value,
  editable,
  busy,
  onChange,
}: {
  readonly title: string;
  readonly icon: IconName;
  readonly subtitle: string;
  readonly value: boolean;
  readonly editable: boolean;
  readonly busy: boolean;
  readonly onChange: (value: boolean) => void;
}): ReactNode {
  if (!editable) {
    return (
      <ListRow
        title={title}
        icon={icon}
        subtitle={subtitle}
        wrapSubtitle
        value={value ? 'On' : 'Off'}
      />
    );
  }
  return (
    <SwitchRow
      title={title}
      icon={icon}
      subtitle={subtitle}
      wrapSubtitle
      value={value}
      disabled={busy}
      onChange={onChange}
    />
  );
}

function DriveOptions({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  const update = useDriveRootUpdate();
  const { root, editable } = card;
  return (
    <View className="gap-3">
      <List inset>
        <DamagedRow card={card} />
        <OptionRow
          title="Keep earlier versions"
          icon="history"
          subtitle={VERSIONS_NOTE}
          value={root.versions}
          editable={editable}
          busy={update.busy}
          onChange={(versions) => {
            update.run(root.id, { versions });
          }}
        />
        <OptionRow
          title="Include hidden files"
          icon={root.includeHidden ? 'eye' : 'eyeOff'}
          subtitle={HIDDEN_NOTE}
          value={root.includeHidden}
          editable={editable}
          busy={update.busy}
          onChange={(includeHidden) => {
            update.run(root.id, { includeHidden });
          }}
        />
      </List>
      <SkipPatterns
        patterns={root.skipPatterns}
        editable={editable}
        busy={update.busy}
        problem={update.problem}
        footer={SKIP_FOOTER}
        onChange={(skipPatterns) => {
          update.run(root.id, { skipPatterns });
        }}
      />
    </View>
  );
}

function DamagedRow({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  const line = damagedLineOf(card.root);
  if (line === null) return null;
  return (
    <NavRow
      title="See damaged files"
      icon="warning"
      iconTone="warning"
      subtitle={line}
      wrapSubtitle
      href={driveSettingsFocusHref('storage')}
    />
  );
}

function DriveHeading({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-3 px-4">
      <IconWell icon={card.icon} colour="primary" size="s" />
      <Text
        variant="title-3"
        accessibilityRole="header"
        numberOfLines={1}
        className="min-w-0 flex-1"
      >
        {card.label}
      </Text>
      <RescanButton card={card} />
    </View>
  );
}

export function DriveCard({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  return (
    <View className="gap-3">
      <DriveHeading card={card} />
      <StateLine card={card} />
      <MetricStrip items={driveTilesOf(card.root)} columns={TILE_COLUMNS} />
      {card.note === null ? null : (
        <Text variant="footnote" tone="variant" className="px-4">
          {card.note}
        </Text>
      )}
      <DriveOptions card={card} />
    </View>
  );
}
