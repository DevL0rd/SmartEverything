import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { FileBrowserHandle } from './browser-types';
import { fittingCount } from './fit-model';
import type { MenuSpec } from './menu-specs';
import { selectionLabelOf } from './selection-model';

interface Measured {
  readonly signature: string;
  readonly widths: ReadonlyMap<string, number>;
  readonly more: number | null;
}

const NOTHING_MEASURED: Measured = { signature: '', widths: new Map(), more: null };

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

function endsOf(widths: readonly (number | undefined)[]): readonly (number | undefined)[] {
  let sum = 0;
  return widths.map((width) => {
    if (width === undefined) return undefined;
    sum += width;
    return sum;
  });
}

function useFit(specs: readonly MenuSpec[]): Fit {
  const signature = specs.map((spec) => spec.id).join('\n');
  const [room, setRoom] = useState<number | null>(null);
  const [stored, setMeasured] = useState<Measured>(NOTHING_MEASURED);
  const measured = stored.signature === signature ? stored : { ...NOTHING_MEASURED, signature };
  const ends = endsOf(specs.map((spec) => measured.widths.get(spec.id)));
  return {
    shown: fittingCount({ ends, room, moreSpan: measured.more ?? undefined }),
    moreKnown: measured.more !== null,
    onRoom: (event): void => {
      setRoom(event.nativeEvent.layout.width);
    },
    onWidth:
      (id) =>
      (event): void => {
        const width = widthOf(event);
        setMeasured((now) => {
          const base = now.signature === signature ? now : { ...NOTHING_MEASURED, signature };
          return base.widths.get(id) === width
            ? base
            : { ...base, widths: new Map(base.widths).set(id, width) };
        });
      },
    onMore: (event): void => {
      const end = widthOf(event);
      setMeasured((now) => {
        const base = now.signature === signature ? now : { ...NOTHING_MEASURED, signature };
        return base.more === null ? { ...base, more: end } : base;
      });
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

function Actions<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
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
      <Actions browser={browser} />
    </View>
  );
}
