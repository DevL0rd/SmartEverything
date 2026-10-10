import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ACCENTS as ACCENT_NAMES, THEMES, type AppearancePref } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ColourSwatches } from '../../../components/colour-swatches';
import { Figure } from '../../../components/figure';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { ACCENT_LABELS, ACCENT_SWATCH } from '../../../design/tokens';
import { joinParts, plural } from '../../../format/text';
import { PREFS, savePref } from '../../../store/prefs';
import { useDevices, useRooms, useSettings } from '../../../store/selectors';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { appearanceOf, appearanceRead } from './appearance-pref';

type Theme = AppearancePref['theme'];

const THEME_OPTIONS: readonly SegmentedOption<Theme>[] = THEMES.map((theme) => ({
  value: theme,
  label: { system: 'System', light: 'Light', dark: 'Dark' }[theme],
  icon: ({ system: 'smartphone', light: 'sun', dark: 'moon' } as const)[theme],
}));

function useAppearance(): {
  readonly value: AppearancePref;
  readonly set: (change: Partial<AppearancePref>) => void;
} {
  const store = useEntityStore();
  const value = useStoreSelector(appearanceOf);
  return {
    value,
    set: (change): void => {
      savePref(store, PREFS.appearance, { ...appearanceOf(store.get()), ...change });
    },
  };
}

export function ThemeRow(): ReactNode {
  const { value, set } = useAppearance();
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="body">Theme</Text>
      <Segmented
        label="Theme"
        options={THEME_OPTIONS}
        value={value.theme}
        onChange={(theme) => {
          set({ theme });
        }}
      />
    </View>
  );
}

export function AccentRow(): ReactNode {
  const { value, set } = useAppearance();
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="body">Accent</Text>
        <Text variant="callout" tone="variant">
          {ACCENT_LABELS[value.accent]}
        </Text>
      </View>
      <ColourSwatches
        label="Accent"
        value={value.accent}
        options={ACCENT_NAMES.map((accent) => ({
          value: accent,
          label: ACCENT_LABELS[accent],
          swatchClassName: ACCENT_SWATCH[accent],
        }))}
        onChange={(accent) => {
          set({ accent });
        }}
      />
    </View>
  );
}

export function AppearancePreview(): ReactNode {
  const settings = useSettings();
  const devices = useDevices();
  const rooms = useRooms();
  const [on, setOn] = useState(true);
  return (
    <Card title="Preview" icon="palette">
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="title-3" numberOfLines={1}>
              {settings.home_name}
            </Text>
            <Text variant="callout" tone="variant">
              {joinParts([plural(devices.length, 'device'), plural(rooms.length, 'room')])}
            </Text>
          </View>
          <Figure value={String(devices.length)} size="m" />
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Badge label="Accent" tone="primary" />
          <Switch label="Preview switch" value={on} onChange={setOn} />
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Button label="Filled" onPress={() => undefined} />
          <Button label="Tonal" variant="tonal" onPress={() => undefined} />
        </View>
      </View>
    </Card>
  );
}

export function InvalidAppearanceBanner(): ReactNode {
  const store = useEntityStore();
  const read = useStoreSelector(appearanceRead);
  return (
    <Banner
      tone="critical"
      title="Your saved appearance could not be read"
      {...(read.status === 'invalid' ? { body: read.reason } : {})}
      action={{
        label: 'Reset',
        onPress: () => {
          savePref(store, PREFS.appearance, PREFS.appearance.defaultValue);
        },
      }}
    />
  );
}
