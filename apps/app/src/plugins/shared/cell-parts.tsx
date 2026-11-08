import { useState, type ReactNode, type Ref } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { href } from '../../app-shell/hrefs';
import type { AppHref } from '../../components/app-href';
import { Badge, type BadgeTone } from '../../components/badge';
import { Button } from '../../components/button';
import type { ConfirmRequest } from '../../components/confirm-store';
import type { IconName } from '../../components/icon';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import type { Tone } from '../../components/tone';
import { cn } from '../../design/cn';
import { useIdiom } from '../../design/platform';
import type { WideClass } from '../../features/devices';
import {
  cellIconForm,
  fitsLine,
  LINE_START,
  lineEndAfter,
  lineWidthAfter,
  listRowsThatFit,
} from './cell-graph-model';
import { PluginButton, PluginIconButton } from './plugin-action';

export interface CellChip {
  readonly tone: BadgeTone;
  readonly label: string;
}

export function CellBadge({ chip }: { readonly chip: CellChip }): ReactNode {
  return <Badge label={chip.label} tone={chip.tone} />;
}

export function CellLine({
  text,
  tone = 'variant',
}: {
  readonly text: string;
  readonly tone?: Tone;
}): ReactNode {
  return (
    <Text variant="footnote" tone={tone} numberOfLines={1}>
      {text}
    </Text>
  );
}

type CellButtonVariant = 'filled' | 'tonal' | 'text';

const ICON_VARIANT = { filled: 'filled', tonal: 'tonal', text: 'standard' } as const;

export interface CellActionProps {
  readonly cls: WideClass;
  readonly label: string;
  readonly icon?: IconName;
  readonly variant: CellButtonVariant;
  readonly href?: AppHref;
  readonly onPress?: () => void;
  readonly ref?: Ref<View>;
}

export function CellAction({ cls, label, icon, variant, ...press }: CellActionProps): ReactNode {
  if (icon !== undefined && cellIconForm(cls)) {
    return <IconButton {...press} icon={icon} label={label} variant={ICON_VARIANT[variant]} />;
  }
  return (
    <Button
      {...press}
      label={label}
      variant={variant}
      size="md"
      {...(icon === undefined ? {} : { icon })}
    />
  );
}

export interface CellPluginActionProps {
  readonly cls: WideClass;
  readonly label: string;
  readonly icon?: IconName;
  readonly variant: CellButtonVariant;
  readonly onPress: () => Promise<unknown>;
  readonly confirmation?: ConfirmRequest;
  readonly loading?: boolean;
  readonly disabled?: boolean;
}

export function CellPluginAction({
  cls,
  label,
  icon,
  variant,
  loading = false,
  disabled = false,
  ...press
}: CellPluginActionProps): ReactNode {
  if (icon !== undefined && cellIconForm(cls)) {
    return (
      <PluginIconButton
        {...press}
        disabled={disabled || loading}
        icon={icon}
        label={label}
        variant={ICON_VARIANT[variant]}
      />
    );
  }
  return (
    <PluginButton
      {...press}
      disabled={disabled}
      label={label}
      variant={variant}
      size="md"
      loading={loading}
      {...(icon === undefined ? {} : { icon })}
    />
  );
}

export function SetUpButton({
  pluginId,
  cls,
}: {
  readonly pluginId: string;
  readonly cls: WideClass;
}): ReactNode {
  return (
    <CellAction
      cls={cls}
      label="Set up"
      variant="filled"
      icon="settings"
      href={href.pluginSettings(pluginId)}
    />
  );
}

export function LegendSwatch({ swatch }: { readonly swatch: string }): ReactNode {
  return <View className={cn('size-2 rounded-full', swatch)} />;
}

export function LegendDot({
  swatch,
  label,
}: {
  readonly swatch: string;
  readonly label: string;
}): ReactNode {
  return (
    <View className="min-w-0 shrink flex-row items-center gap-1" aria-hidden>
      <LegendSwatch swatch={swatch} />
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
        {label}
      </Text>
    </View>
  );
}

export interface FitItem {
  readonly key: string;
  readonly node: ReactNode;
}

function endOf(event: LayoutChangeEvent): number {
  const { x, width } = event.nativeEvent.layout;
  return x + width;
}

export function FitLine({ items }: { readonly items: readonly FitItem[] }): ReactNode {
  const [{ width, ends }, setFit] = useState(LINE_START);
  const measure = (key: string, end: number): void => {
    setFit((prev) => lineEndAfter(prev, key, end));
  };
  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setFit((prev) => lineWidthAfter(prev, next));
      }}
      className="min-w-0 max-w-full flex-row items-center gap-3 overflow-hidden"
      aria-hidden
    >
      {items.map((item, index) => (
        <View
          key={item.key}
          onLayout={(event) => {
            measure(item.key, endOf(event));
          }}
          className={cn(
            'shrink-0 flex-row items-center gap-1.5',
            index === 0 ? 'max-w-full' : !fitsLine(ends.get(item.key), width) && 'opacity-0',
          )}
        >
          {item.node}
        </View>
      ))}
    </View>
  );
}

export function useListRoom(): {
  readonly rows: number | null;
  readonly onLayout: (event: LayoutChangeEvent) => void;
} {
  const idiom = useIdiom();
  const [room, setRoom] = useState<number | null>(null);
  return {
    rows: room === null ? null : listRowsThatFit(room, idiom),
    onLayout: (event): void => {
      setRoom(Math.floor(event.nativeEvent.layout.height));
    },
  };
}
