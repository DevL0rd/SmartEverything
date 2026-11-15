import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { FileBrowserHandle } from './browser-types';
import { endsOf, fittingCount } from './fit-model';
import type { MenuSpec } from './menu-specs';
import { selectionLabelOf } from './selection-model';

interface Measured {
  readonly widths: ReadonlyMap<string, number>;
  readonly more: number | null;
}

const NOTHING_MEASURED: Measured = { widths: new Map(), more: null };

interface Fit {
  readonly shown: number;
  readonly moreKnown: boolean;
  readonly onRoom: (event: LayoutChangeEvent) => void;
  readonly onWidth: (id: string) => (event: LayoutChangeEvent) => void;
  readonly onMore: (event: LayoutChangeEvent) => void;
}

function widthOf(event: LayoutChangeEvent): number {
  return event.nativeEvent.layout.width;
}

function useFit(specs: readonly MenuSpec[]): Fit {
  const [room, setRoom] = useState<number | null>(null);
  const [measured, setMeasured] = useState<Measured>(NOTHING_MEASURED);
  const ends = endsOf(specs.map((spec) => measured.widths.get(spec.id)));
  return {
    shown: fittingCount({ ends, room, moreSpan: measured.more ?? undefined }),
    moreKnown: measured.more !== null,
    onRoom: (event): void => {
      setRoom(widthOf(event));
    },
    onWidth:
      (id) =>
      (event): void => {
        const width = widthOf(event);
        setMeasured((now) =>
          now.widths.get(id) === width
            ? now
            : { ...now, widths: new Map(now.widths).set(id, width) },
        );
      },
    onMore: (event): void => {
      const width = widthOf(event);
      setMeasured((now) => (now.more === width ? now : { ...now, more: width }));
    },
  };
}

function menuItemsOf<O>(browser: FileBrowserHandle<O>, specs: readonly MenuSpec[]): MenuItem[] {
  return specs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    icon: spec.icon,
    ...(spec.destructive ? { destructive: true } : {}),
    onPress: (): void => {
      browser.commands.menu(spec.id, browser.picked);
    },
  }));
}

function Action<O>({
  browser,
  spec,
  lead,
  divided,
  onLayout,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly spec: MenuSpec;
  readonly lead: boolean;
  readonly divided: boolean;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}): ReactNode {
  return (
    <View onLayout={onLayout} className={cn('shrink-0', !lead && 'pl-2')}>
      <View className={cn(divided && 'border-l border-outline-variant pl-2')}>
        <Button
          label={spec.label}
          icon={spec.icon}
          variant={spec.destructive ? 'destructive' : 'tonal'}
          onPress={() => {
            browser.commands.menu(spec.id, browser.picked);
          }}
        />
      </View>
    </View>
  );
}

export function SelectionActions<O>({
  browser,
}: {
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  const specs = [...browser.barActions.actions, ...browser.barActions.danger];
  const fit = useFit(specs);
  const hidden = specs.slice(fit.shown);
  return (
    <View onLayout={fit.onRoom} className="min-w-0 flex-1 flex-row items-center overflow-hidden">
      {specs.slice(0, fit.shown).map((spec, index) => (
        <Action
          key={spec.id}
          browser={browser}
          spec={spec}
          lead={index === 0}
          divided={spec.destructive ? specs[index - 1]?.destructive !== true : false}
          onLayout={fit.onWidth(spec.id)}
        />
      ))}
      {!fit.moreKnown && hidden.length === 0 ? (
        <View
          onLayout={fit.onMore}
          className="shrink-0 pl-2 opacity-0"
          aria-hidden
          pointerEvents="none"
        >
          <IconButton icon="ellipsis" label="More actions" />
        </View>
      ) : null}
      {hidden.length === 0 ? null : (
        <View className={cn('shrink-0', fit.shown > 0 && 'pl-2')}>
          <OverflowButton items={menuItemsOf(browser, hidden)} label="More actions" />
        </View>
      )}
    </View>
  );
}

export function SelectionRow<O>({
  browser,
}: {
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  const { picked, order, commands } = browser;
  return (
    <View className="flex-row items-center gap-2 pb-1">
      <IconButton icon="close" label="Clear the selection" onPress={commands.clearSelection} />
      <Text variant="body-strong" numberOfLines={1} className="shrink-0">
        {selectionLabelOf(picked.length)}
      </Text>
      {picked.length < order.length ? (
        <Button label="Select all" variant="text" onPress={commands.selectAll} />
      ) : null}
      <SelectionActions browser={browser} />
    </View>
  );
}
