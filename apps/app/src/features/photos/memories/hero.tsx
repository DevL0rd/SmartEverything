import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { ThemeScope } from '../../../design/theme-scope';
import { useSaveAsAlbum } from './actions';
import { coverFirst, restText, stripOf, useMemoryItems, type MemoryMedia } from './items';
import { MemoryPicture } from './memory-picture';
import { heroLine, heroMark, memoryTitle, type HeroMemory } from './model';
import { PhotoMark } from './photo-mark';
import { positionText } from './player-model';
import { yearsAgoText } from './text';

interface PagerState {
  readonly index: number;
  readonly total: number;
  readonly onStep: (index: number) => void;
}

interface SlideProps {
  readonly memory: HeroMemory;
  readonly media: readonly MemoryMedia[];
  readonly pager: PagerState;
  readonly onPlay: () => void;
}

function Step({
  pager,
  by,
  variant,
}: {
  readonly pager: PagerState;
  readonly by: 1 | -1;
  readonly variant: 'standard' | 'overlay';
}): ReactNode {
  const target = pager.index + by;
  return (
    <IconButton
      icon={by === 1 ? 'chevronRight' : 'chevronLeft'}
      label={by === 1 ? 'Next memory' : 'Previous memory'}
      variant={variant}
      disabled={target < 0 || target >= pager.total}
      onPress={() => {
        pager.onStep(target);
      }}
    />
  );
}

function SaveButton({
  memory,
  short,
}: {
  readonly memory: HeroMemory;
  readonly short: boolean;
}): ReactNode {
  const save = useSaveAsAlbum(memory);
  return save === null ? null : (
    <Button
      label={short ? 'Save' : 'Save as album'}
      spoken="Save as album"
      icon="layers"
      variant="outlined"
      loading={save.busy}
      onPress={save.run}
    />
  );
}

function Strip({ memory, media }: Pick<SlideProps, 'memory' | 'media'>): ReactNode {
  const strip = stripOf(media, memory.coverItemId);
  const rest = restText(memory.count, strip.length);
  return strip.length === 0 ? null : (
    <View className="mt-1 flex-row items-center gap-1">
      {strip.map((item) => (
        <MemoryPicture key={item.id} item={item} size="thumb" className="h-12 w-16 rounded-sm" />
      ))}
      {rest === null ? null : (
        <Text variant="caption" tone="variant" className="ml-1.5 tabular-nums">
          {rest}
        </Text>
      )}
    </View>
  );
}

function DesktopPager({ pager }: { readonly pager: PagerState }): ReactNode {
  return pager.total < 2 ? null : (
    <View className="ml-auto flex-row items-center gap-1">
      <Text variant="caption" tone="variant" className="tabular-nums">
        {positionText(pager.index, pager.total)}
      </Text>
      <Step pager={pager} by={-1} variant="standard" />
      <Step pager={pager} by={1} variant="standard" />
    </View>
  );
}

function DesktopSlide({ memory, media, pager, onPlay }: SlideProps): ReactNode {
  const cover = coverFirst(media, memory.coverItemId)[0] ?? null;
  return (
    <Card padding="none" className="h-65 flex-row overflow-hidden">
      <View className="w-1/2">
        <MemoryPicture item={cover} size="preview" className="absolute inset-0" />
        <PhotoMark label={heroMark(memory, false)} />
      </View>
      <View className="min-w-0 flex-1 gap-2 p-6">
        <Text variant="caption" tone="variant">
          {yearsAgoText(memory.yearsAgo)}
        </Text>
        <Text variant="title-1" numberOfLines={2}>
          {memoryTitle(memory)}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {heroLine(memory)}
        </Text>
        <Strip memory={memory} media={media} />
        <View className="mt-auto flex-row flex-wrap items-center gap-2">
          <Button label="Play memory" icon="play" onPress={onPlay} />
          <SaveButton memory={memory} short={false} />
          <DesktopPager pager={pager} />
        </View>
      </View>
    </Card>
  );
}

function PhonePager({ pager }: { readonly pager: PagerState }): ReactNode {
  return pager.total < 2 ? null : (
    <>
      <PhotoMark label={positionText(pager.index, pager.total)} corner="top-right" />
      <ThemeScope theme="dark">
        <View className="absolute inset-x-1 bottom-1 flex-row justify-between">
          <Step pager={pager} by={-1} variant="overlay" />
          <Step pager={pager} by={1} variant="overlay" />
        </View>
      </ThemeScope>
    </>
  );
}

function PhoneSlide({ memory, media, pager, onPlay }: SlideProps): ReactNode {
  const cover = coverFirst(media, memory.coverItemId)[0] ?? null;
  return (
    <Card padding="none" className="overflow-hidden">
      <View className="h-55">
        <MemoryPicture item={cover} size="preview" className="absolute inset-0" />
        <PhotoMark label={heroMark(memory, true)} />
        <PhonePager pager={pager} />
      </View>
      <View className="gap-2 px-4 pt-3.5 pb-4">
        <Text variant="title-2" numberOfLines={2}>
          {memoryTitle(memory)}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {heroLine(memory)}
        </Text>
        <View className="flex-row gap-2">
          <Button label="Play memory" icon="play" grow onPress={onPlay} />
          <SaveButton memory={memory} short />
        </View>
      </View>
    </Card>
  );
}

function Slide({
  memory,
  compact,
  pager,
  onPlay,
}: Omit<SlideProps, 'media'> & { readonly compact: boolean }): ReactNode {
  const { items } = useMemoryItems(memory.id);
  return compact ? (
    <PhoneSlide memory={memory} media={items} pager={pager} onPlay={onPlay} />
  ) : (
    <DesktopSlide memory={memory} media={items} pager={pager} onPlay={onPlay} />
  );
}

export interface MemoryHeroProps {
  readonly memories: readonly HeroMemory[];
  readonly compact: boolean;
  readonly onPlay: (memory: HeroMemory) => void;
}

export function MemoryHero({ memories, compact, onPlay }: MemoryHeroProps): ReactNode {
  const [picked, setPicked] = useState(0);
  const index = Math.min(picked, memories.length - 1);
  const memory = memories[index];
  if (memory === undefined) return null;
  return (
    <Slide
      key={memory.id}
      memory={memory}
      compact={compact}
      pager={{ index, total: memories.length, onStep: setPicked }}
      onPlay={() => {
        onPlay(memory);
      }}
    />
  );
}
