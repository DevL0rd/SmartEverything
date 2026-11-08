import { useMemo, useState, type ReactNode } from 'react';
import { Text as Glyph, useWindowDimensions, View, type LayoutRectangle } from 'react-native';
import type { EmojiChoice } from '@smarteverything/domain';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { floatingSheetFrame } from './compact-panel';
import { COMMON_EMOJI, emojiMatches, emojiPage, emojiPickerCategories } from './emoji-page';
import { emojiPickerLayout } from './emoji-picker-layout';
import { IconButton } from './icon-button';
import { Interactive } from './interactive';
import { SearchField } from './search-field';
import { Sheet, type SheetProps } from './sheet';
import { Text } from './text';

const DETENTS = ['fit'] as const;
const NO_LAYOUT = { width: 0, height: 0 } as const;

interface PickerProps extends PickerBodyProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly subpage?: SheetProps['subpage'];
}

interface PickerBodyProps {
  readonly preview?: string;
  readonly selected?: ReadonlySet<string>;
  readonly unavailable?: ReadonlySet<string>;
  readonly onSelect: (glyph: string) => void;
}

interface ChoiceGridProps {
  readonly unavailable: ReadonlySet<string> | undefined;
  readonly entries: readonly EmojiChoice[];
  readonly pointer: boolean;
  readonly cellWidth: number;
  readonly selected: ReadonlySet<string> | undefined;
  readonly onSelect: (glyph: string) => void;
}

function ChoiceGrid({
  entries,
  pointer,
  cellWidth,
  selected,
  unavailable,
  onSelect,
}: ChoiceGridProps): ReactNode {
  const cell = { width: cellWidth };
  return (
    <View role="list" accessibilityLabel="Emoji choices" className="flex-row flex-wrap">
      {entries.map(({ glyph, name }) => (
        <View key={glyph} className={pointer ? 'h-10' : 'h-12'} style={cell} role="listitem">
          <Interactive
            label={name}
            hint={selected?.has(glyph) === true ? 'Remove reaction' : 'Add reaction'}
            selected={selected?.has(glyph)}
            disabled={unavailable?.has(glyph)}
            focusInset
            className={cn(
              'flex-1 items-center justify-center rounded-md',
              selected?.has(glyph) === true && 'border border-primary bg-primary-container',
            )}
            onPress={() => {
              onSelect(glyph);
            }}
          >
            <Glyph aria-hidden className="text-title-1">
              {glyph}
            </Glyph>
          </Interactive>
        </View>
      ))}
    </View>
  );
}

interface PaginationProps {
  readonly page: ReturnType<typeof emojiPage<EmojiChoice>>;
  readonly count: number;
  readonly size: number;
  readonly onPage: (offset: number) => void;
}

function Pagination({ page, count, size, onPage }: PaginationProps): ReactNode {
  if (page.total < 2) return null;
  return (
    <View className="flex-row items-center justify-between gap-2 border-t border-outline-variant">
      <IconButton
        icon="chevronLeft"
        label="Previous emoji page"
        disabled={page.start === 0}
        onPress={() => {
          onPage(page.start - size);
        }}
      />
      <Text align="center" variant="caption" tone="variant" accessibilityLiveRegion="polite">
        {page.start + 1}–{page.end} of {count}
      </Text>
      <IconButton
        icon="chevronRight"
        label="Next emoji page"
        disabled={page.end === count}
        onPress={() => {
          onPage(page.end);
        }}
      />
    </View>
  );
}

function CategoryRail({
  category,
  width,
  onChoose,
}: {
  readonly category: string;
  readonly width: number;
  readonly onChoose: (name: string) => void;
}): ReactNode {
  const cell = { width };
  return (
    <View
      accessibilityLabel="Emoji categories"
      className="flex-row flex-wrap rounded-md bg-surface-2"
    >
      {emojiPickerCategories().map(({ name, label }) => {
        const selected = name === category;
        return (
          <View key={name} style={cell}>
            <Interactive
              label={name.includes(label) ? name : `${label}, ${name}`}
              selected={selected}
              focusInset
              className={cn(
                'min-h-touch-min items-center justify-center rounded-md',
                selected && 'bg-primary-container',
              )}
              onPress={() => {
                onChoose(name);
              }}
            >
              <Text variant="caption" tone={selected ? 'onPrimaryContainer' : 'variant'}>
                {label}
              </Text>
            </Interactive>
          </View>
        );
      })}
    </View>
  );
}

function usePicker(): {
  readonly query: string;
  readonly changeQuery: (text: string) => void;
  readonly category: string;
  readonly choose: (name: string) => void;
  readonly offset: number;
  readonly setOffset: (index: number) => void;
} {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(COMMON_EMOJI);
  const [offset, setOffset] = useState(0);
  return {
    query,
    category,
    offset,
    setOffset,
    changeQuery: (text): void => {
      setQuery(text);
      setOffset(0);
    },
    choose: (name): void => {
      setCategory(name);
      setQuery('');
      setOffset(0);
    },
  };
}

function usePickerPage(): {
  readonly state: ReturnType<typeof usePicker>;
  readonly pointer: boolean;
  readonly layout: ReturnType<typeof emojiPickerLayout>;
  readonly measure: (layout: LayoutRectangle) => void;
  readonly page: ReturnType<typeof emojiPage<EmojiChoice>>;
  readonly count: number;
} {
  const state = usePicker();
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pointer = useIdiom() === 'pointer';
  const [controls, setControls] = useState<Pick<LayoutRectangle, 'width' | 'height'>>(NO_LAYOUT);
  const matches = useMemo(
    () => emojiMatches(state.category, state.query),
    [state.category, state.query],
  );
  const height = pointer ? viewport.height : floatingSheetFrame(viewport, insets).maxHeight;
  const layout = emojiPickerLayout({
    width: controls.width,
    height,
    controlsHeight: controls.height,
    count: matches.length,
    pointer,
  });
  return {
    state,
    pointer,
    layout,
    measure: ({ width, height: nextHeight }): void => {
      setControls((previous) =>
        previous.width === width && previous.height === nextHeight
          ? previous
          : { width, height: nextHeight },
      );
    },
    page: emojiPage(matches, state.offset, layout.pageSize),
    count: matches.length,
  };
}

function PickerControls({
  preview,
  state,
  pointer,
  width,
  measure,
}: {
  readonly preview: string | undefined;
  readonly state: ReturnType<typeof usePicker>;
  readonly pointer: boolean;
  readonly width: number;
  readonly measure: (layout: LayoutRectangle) => void;
}): ReactNode {
  return (
    <View
      className="gap-2"
      onLayout={({ nativeEvent }) => {
        measure(nativeEvent.layout);
      }}
    >
      {preview === undefined ? null : (
        <Text
          variant="caption"
          tone="variant"
          numberOfLines={1}
          className="border-l-2 border-outline-variant pl-2"
        >
          {preview}
        </Text>
      )}
      <SearchField
        value={state.query}
        onChange={state.changeQuery}
        placeholder="Search emoji"
        focusOnMount={pointer}
      />
      {state.query.trim() === '' ? (
        <CategoryRail category={state.category} width={width} onChoose={state.choose} />
      ) : null}
    </View>
  );
}

function EmojiPickerBody({ preview, selected, unavailable, onSelect }: PickerBodyProps): ReactNode {
  const { state, pointer, layout, measure, page, count } = usePickerPage();
  return (
    <View className="gap-2 pb-2">
      <PickerControls
        preview={preview}
        state={state}
        pointer={pointer}
        width={layout.categoryWidth}
        measure={measure}
      />
      {page.entries.length === 0 ? (
        <Text variant="callout" tone="variant" className="py-2" accessibilityLiveRegion="polite">
          No emoji found.
        </Text>
      ) : (
        <ChoiceGrid
          entries={page.entries}
          pointer={pointer}
          cellWidth={layout.cellWidth}
          selected={selected}
          unavailable={unavailable}
          onSelect={onSelect}
        />
      )}
      <Pagination page={page} count={count} size={layout.pageSize} onPage={state.setOffset} />
    </View>
  );
}

export function EmojiPicker({ title, onClose, subpage, ...body }: PickerProps): ReactNode {
  return (
    <Sheet open onClose={onClose} title={title} detents={DETENTS} subpage={subpage}>
      <EmojiPickerBody {...body} />
    </Sheet>
  );
}
