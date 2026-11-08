import { memo, useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { FileGlyph } from '../../../components/files/file-glyph';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useContextMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { ThemeScope } from '../../../design/theme-scope';
import { leftText, tileLabelOf, type DeletedItem } from './model';

export interface TileHandlers {
  readonly onPress: (item: DeletedItem) => void;
  readonly onRestore: (item: DeletedItem) => void;
  readonly onDeleteNow: ((item: DeletedItem) => void) | null;
  readonly disabled: boolean;
}

export interface DeletedTileProps extends TileHandlers {
  readonly item: DeletedItem;
  readonly width: number;
  readonly height: number;
  readonly selecting: boolean;
  readonly picked: boolean;
  readonly pointer: boolean;
}

const RING = 14;
const STROKE = 2;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function boxOf(width: number, height: number): ViewStyle {
  return { width, height };
}

export function CountdownRing({
  kept,
  critical,
}: {
  readonly kept: number;
  readonly critical: boolean;
}): ReactNode {
  const track = useColour('on-surface');
  const stroke = useColour(critical ? 'critical' : 'on-surface');
  const centre = RING / 2;
  return (
    <Svg width={RING} height={RING} aria-hidden>
      <Circle
        cx={centre}
        cy={centre}
        r={RADIUS}
        fill="none"
        stroke={track}
        strokeOpacity={0.3}
        strokeWidth={STROKE}
      />
      <Circle
        cx={centre}
        cy={centre}
        r={RADIUS}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE}
        strokeDasharray={`${String(CIRCUMFERENCE * kept)} ${String(CIRCUMFERENCE)}`}
        transform={`rotate(-90 ${String(centre)} ${String(centre)})`}
      />
    </Svg>
  );
}

function Face({ item }: { readonly item: DeletedItem }): ReactNode {
  return (
    <View className="absolute inset-0 items-center justify-center gap-1 bg-surface-3 px-2 pb-7 pt-7">
      <FileGlyph kind={item.isFolder ? 'folder' : 'file'} name={item.name} well="m" />
      <Text variant="caption" tone="variant" align="center" numberOfLines={2}>
        {item.name}
      </Text>
    </View>
  );
}

function Check({ picked }: { readonly picked: boolean }): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute left-1.5 top-1.5 size-5 items-center justify-center rounded-full border-2',
        picked ? 'border-primary bg-primary' : 'border-white/90 bg-black/20',
      )}
    >
      {picked ? <Icon name="check" size={16} tone="onPrimary" /> : null}
    </View>
  );
}

function Marks({ item }: { readonly item: DeletedItem }): ReactNode {
  return (
    <ThemeScope theme="dark">
      <View
        pointerEvents="none"
        className="absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5"
      >
        <CountdownRing kept={item.kept} critical={item.critical} />
        <Text
          variant="caption"
          tone={item.critical ? 'critical' : 'default'}
          className="tabular-nums"
        >
          {leftText(item.daysLeft)}
        </Text>
      </View>
      {item.who === null ? null : (
        <View
          pointerEvents="none"
          className="absolute bottom-1.5 left-1.5 max-w-1/2 rounded-full bg-black/50 px-1.5 py-0.5"
        >
          <Text variant="caption" numberOfLines={1}>
            {item.who}
          </Text>
        </View>
      )}
    </ThemeScope>
  );
}

function HoverRestore({
  item,
  onRestore,
}: {
  readonly item: DeletedItem;
  readonly onRestore: (item: DeletedItem) => void;
}): ReactNode {
  return (
    <ThemeScope theme="dark">
      <View className="absolute inset-0 items-center justify-center" pointerEvents="box-none">
        <Interactive
          label={`Restore ${item.name}`}
          onPress={() => {
            onRestore(item);
          }}
          className="h-8 flex-row items-center gap-1.5 rounded-md bg-black/60 px-2.5"
          layerClassName="rounded-md"
        >
          <Icon name="archiveRestore" size={16} tone="default" />
          <Text variant="footnote" className="font-sans-medium">
            Restore
          </Text>
        </Interactive>
      </View>
    </ThemeScope>
  );
}

export function tileMenuOf(item: DeletedItem, handlers: TileHandlers): readonly MenuItem[] {
  const { disabled } = handlers;
  const restore: MenuItem = {
    label: 'Restore',
    icon: 'archiveRestore',
    disabled,
    onPress: () => {
      handlers.onRestore(item);
    },
  };
  const { onDeleteNow } = handlers;
  if (onDeleteNow === null) return [restore];
  return [
    restore,
    {
      label: 'Delete now',
      icon: 'trash',
      destructive: true,
      disabled,
      onPress: (): void => {
        onDeleteNow(item);
      },
    },
  ];
}

function Tile(props: DeletedTileProps): ReactNode {
  const { item, width, height, selecting, picked, pointer } = props;
  const [hovered, setHovered] = useState(false);
  const menu = useContextMenu(tileMenuOf(item, props), item.name, {
    preview: (
      <View style={boxOf(width, height)}>
        <Face item={item} />
      </View>
    ),
  });
  return (
    <View
      style={boxOf(width, height)}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        label={tileLabelOf(item)}
        checked={selecting ? picked : undefined}
        className={cn('size-full rounded-xs', picked && 'border-2 border-primary')}
        onPress={() => {
          props.onPress(item);
        }}
        onLongPress={selecting ? undefined : menu.onLongPress}
        onContextMenu={selecting ? undefined : menu.onContextMenu}
      >
        <Face item={item} />
        <Marks item={item} />
        {selecting ? <Check picked={picked} /> : null}
      </Interactive>
      {pointer && hovered && !selecting && !props.disabled ? (
        <HoverRestore item={item} onRestore={props.onRestore} />
      ) : null}
      {menu.host}
    </View>
  );
}

export const DeletedTile = memo(Tile);
