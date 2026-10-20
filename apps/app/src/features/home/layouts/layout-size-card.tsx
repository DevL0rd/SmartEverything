import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BOARD_CLASSES, type BoardClass } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { BOARD_LABELS, sourceText, type LayoutSizeRow } from '../model/layout-sizes';
import {
  copyLayoutSize,
  followLayoutSize,
  resetLayoutSize,
  type LayoutSizeContext,
} from './layout-size-actions';

function MenuButton({
  label,
  icon,
  items,
  disabled = false,
}: {
  readonly label: string;
  readonly icon: IconName;
  readonly items: readonly MenuItem[];
  readonly disabled?: boolean;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, label);
  return (
    <View collapsable={false} ref={ref}>
      <Button label={label} icon={icon} variant="outlined" disabled={disabled} onPress={open} />
      {menu}
    </View>
  );
}

function othersOf(board: BoardClass): readonly BoardClass[] {
  return BOARD_CLASSES.filter((other) => other !== board);
}

function EditHint({ row }: { readonly row: LayoutSizeRow }): ReactNode {
  if (row.current) {
    return <Button label="Edit on Home" icon="pencil" variant="tonal" href={href.home()} />;
  }
  return (
    <Text variant="footnote" tone="variant">
      To edit this layout, open Home on a screen of this size (unfold the phone or resize the
      window), then choose Edit layout.
    </Text>
  );
}

function copyItemsOf(row: LayoutSizeRow, context: LayoutSizeContext): readonly MenuItem[] {
  return othersOf(row.board).map((from) => ({
    label: `Copy from ${BOARD_LABELS[from]}`,
    icon: 'copy' as const,
    onPress: (): void => {
      copyLayoutSize(context, from, row.board).catch(notifyFailure('The layout was not changed'));
    },
  }));
}

function followItemsOf(row: LayoutSizeRow, context: LayoutSizeContext): readonly MenuItem[] {
  return [
    ...othersOf(row.board).map((target) => ({
      label: `Follow ${BOARD_LABELS[target]}`,
      icon: 'link' as const,
      ...(row.follows === target ? { description: 'Following now' } : {}),
      onPress: (): void => {
        followLayoutSize(context, row.board, target);
      },
    })),
    {
      label: 'Use the default',
      icon: 'reset' as const,
      onPress: (): void => {
        followLayoutSize(context, row.board, null);
      },
    },
  ];
}

function Summary({
  row,
  widest,
}: {
  readonly row: LayoutSizeRow;
  readonly widest: number;
}): ReactNode {
  return (
    <>
      <View className="gap-1">
        <Text variant="title-2">{plural(row.count, 'widget')}</Text>
        <Text variant="footnote" tone="variant">
          {sourceText(row)} · {row.range} · {String(row.columns)} columns
        </Text>
      </View>
      <ProgressBar
        progress={widest === 0 ? 0 : row.count / widest}
        colour="primary"
        label={`${plural(row.count, 'widget')}, compared with the fullest size`}
      />
    </>
  );
}

export function LayoutSizeCard({
  row,
  widest,
  context,
}: {
  readonly row: LayoutSizeRow;
  readonly widest: number;
  readonly context: LayoutSizeContext;
}): ReactNode {
  return (
    <Card
      title={`${BOARD_LABELS[row.board]} screens`}
      icon="grid"
      action={row.current ? <Badge label="This screen" tone="primary" /> : null}
    >
      <Summary row={row} widest={widest} />
      <EditHint row={row} />
      <View className="flex-row flex-wrap items-center gap-2">
        <MenuButton label="Copy from" icon="copy" items={copyItemsOf(row, context)} />
        {row.source === 'own' ? null : (
          <MenuButton label="Follow" icon="link" items={followItemsOf(row, context)} />
        )}
        <View className="flex-1" />
        <Button
          label="Reset"
          icon="reset"
          variant="destructive"
          disabled={row.source === 'default'}
          onPress={() => {
            resetLayoutSize(context, row.board).catch(notifyFailure('The layout was not changed'));
          }}
        />
      </View>
    </Card>
  );
}
