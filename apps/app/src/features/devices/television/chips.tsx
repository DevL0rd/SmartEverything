import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { HScroller } from '../../../components/h-scroller';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { TONE_CLASS, type TvApp } from './apps';
import { KEY_EDGE, KEY_FOCUS } from './key-style';
import type { Television } from './use-television';

const CHIP = cn(
  'min-h-touch-min flex-row items-center gap-2 rounded-full bg-surface-2 active:scale-95 active:bg-surface-3',
  KEY_EDGE,
  KEY_FOCUS,
);

export function inputIcon(id: string): IconName {
  return id.startsWith('HDMI') ? 'cable' : 'antenna';
}

function Monogram({ app, size }: { readonly app: TvApp; readonly size: 'sm' | 'md' }): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'items-center justify-center',
        TONE_CLASS[app.tone],
        size === 'sm' ? 'size-5 rounded-sm' : 'size-7 rounded-md',
      )}
    >
      <Text variant="caption" className="font-sans-semibold">
        {app.monogram}
      </Text>
    </View>
  );
}

function InputChip({
  tv,
  onPress,
}: {
  readonly tv: Television;
  readonly onPress: () => void;
}): ReactNode {
  const current = tv.view.inputs.find((input) => input.id === tv.view.input);
  const text = tv.view.app === null ? (current?.label ?? 'Input') : 'Input';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        tv.view.app === null && current !== undefined
          ? `Input: ${current.label}. Change input`
          : 'Input. Change input'
      }
      onPress={onPress}
      className={cn(CHIP, 'pl-3.5 pr-3')}
    >
      <Text variant="label">{text}</Text>
      <Icon name="chevronDown" size={16} />
    </Pressable>
  );
}

function AppChip({
  app,
  current,
  onOpen,
}: {
  readonly app: TvApp;
  readonly current: boolean;
  readonly onOpen: (name: string) => void;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${app.name}`}
      accessibilityState={{ selected: current }}
      onPress={() => {
        selectionTick();
        onOpen(app.name);
      }}
      className={cn(CHIP, 'pl-2 pr-3.5', current && 'border-primary bg-primary-container')}
    >
      <Monogram app={app} size="sm" />
      <Text variant="label" numberOfLines={1}>
        {app.name}
      </Text>
    </Pressable>
  );
}

function MoreChip({ onPress }: { readonly onPress: () => void }): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="More apps"
      onPress={onPress}
      className={cn(CHIP, 'pl-3 pr-3.5')}
    >
      <Icon name="plus" size={16} />
      <Text variant="label">More</Text>
    </Pressable>
  );
}

export function ChipRow({
  tv,
  apps,
  lead = null,
  onInputs,
  onMore,
  onOpen,
}: {
  readonly tv: Television;
  readonly lead?: ReactNode;
  readonly apps: readonly TvApp[];
  readonly onInputs: () => void;
  readonly onMore: (() => void) | null;
  readonly onOpen: (name: string) => void;
}): ReactNode {
  return (
    <HScroller label="Input and apps" fade>
      {lead}
      <InputChip tv={tv} onPress={onInputs} />
      {apps.map((app) => (
        <AppChip
          key={app.name}
          app={app}
          current={tv.view.watching.kind === 'app' && tv.view.watching.label === app.name}
          onOpen={onOpen}
        />
      ))}
      {onMore === null ? null : <MoreChip onPress={onMore} />}
    </HScroller>
  );
}

export function AppGrid({
  apps,
  off,
  current,
  onOpen,
}: {
  readonly apps: readonly TvApp[];
  readonly off: boolean;
  readonly current: string | null;
  readonly onOpen: (name: string) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {apps.map((app) => (
        <Pressable
          key={app.name}
          accessibilityRole="button"
          accessibilityLabel={`Open ${app.name}`}
          accessibilityState={{ disabled: off, selected: current === app.name }}
          disabled={off}
          onPress={() => {
            selectionTick();
            onOpen(app.name);
          }}
          className={cn(
            'h-16 w-20 items-center justify-center gap-1.5 rounded-md border-hairline border-outline-variant bg-surface-2 active:bg-surface-3',
            KEY_FOCUS,
            current === app.name && 'border-primary bg-primary-container',
            off && 'opacity-60',
          )}
        >
          <Monogram app={app} size="md" />
          <Text variant="caption" numberOfLines={1}>
            {app.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function InputPills({
  tv,
  onChoose,
}: {
  readonly tv: Television;
  readonly onChoose: (id: string) => void;
}): ReactNode {
  const off = tv.view.mode !== 'on';
  return (
    <View className="flex-row flex-wrap gap-2">
      {tv.view.inputs.map((input) => {
        const current = input.id === tv.view.input && tv.view.app === null;
        return (
          <Pressable
            key={input.id}
            accessibilityRole="button"
            accessibilityLabel={input.label}
            accessibilityState={{ disabled: off, selected: current }}
            disabled={off}
            onPress={() => {
              selectionTick();
              onChoose(input.id);
            }}
            className={cn(
              CHIP,
              'px-4',
              current && 'border-primary bg-primary-container',
              off && 'opacity-60',
            )}
          >
            <Icon name={inputIcon(input.id)} size={16} />
            <Text variant="label">{input.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
