import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { MetricStrip } from '../../../components/metric-strip';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { SkipPatterns } from '../computers/skip-patterns';
import { useDriveRescan, useDriveRootUpdate } from '../data';
import {
  HIDDEN_NOTE,
  SKIP_FOOTER,
  VERSIONS_NOTE,
  driveStateLineOf,
  driveTilesOf,
  type DriveSettingsCard,
} from './drive-card-model';

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

function StateLine({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  const line = driveStateLineOf(card.root, useMinute());
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Badge label={line.text} tone={line.tone} />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {card.who}
      </Text>
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

export function DriveCard({ card }: { readonly card: DriveSettingsCard }): ReactNode {
  return (
    <Card title={card.label} icon={card.icon} action={<RescanButton card={card} />}>
      <StateLine card={card} />
      <MetricStrip items={driveTilesOf(card.root)} columns={TILE_COLUMNS} />
      {card.note === null ? null : (
        <Text variant="footnote" tone="variant">
          {card.note}
        </Text>
      )}
      <DriveOptions card={card} />
    </Card>
  );
}
