import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { Memory } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../components/overlay';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { ThemeScope } from '../../../design/theme-scope';
import { clock, longDate } from '../../../format/time';
import { useDriveLink } from '../../nas/data';
import { useSaveAsAlbum, useToChat } from './actions';
import { memoryKicker, memoryTitle } from './model';
import { photoLine } from './player-model';
import { PlayerProgress, PlayerStage } from './player-stage';
import { useMemoryPlayer, type MemoryPlayerState } from './use-memory-player';

export const PLAYER_HINT = 'Tap the sides to step · hold to pause';

interface PartProps {
  readonly memory: Memory;
  readonly player: MemoryPlayerState;
}

function Caption({
  memory,
  player,
  compact,
}: PartProps & { readonly compact: boolean }): ReactNode {
  const takenAt = player.current?.takenAt ?? null;
  const when = takenAt === null ? null : { day: longDate(takenAt), time: clock(takenAt) };
  return (
    <View className="min-w-0 shrink gap-1">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {memoryKicker(memory)}
      </Text>
      <Text variant={compact ? 'title-1' : 'large-title'} numberOfLines={2}>
        {memoryTitle(memory)}
      </Text>
      <Text variant="footnote" tone="variant" className="tabular-nums">
        {photoLine(when, memory.from === memory.to, player.position.index, player.total)}
      </Text>
    </View>
  );
}

function Actions({ memory, player, grow }: PartProps & { readonly grow: boolean }): ReactNode {
  const save = useSaveAsAlbum(memory);
  const preview = useDriveLink(player.current?.id ?? null, player.current?.rev ?? 1, 'thumb');
  const chat = useToChat(player.current, preview);
  return (
    <View className="flex-row gap-2">
      {save === null ? null : (
        <Button
          label="Save as album"
          icon="layers"
          variant="outlined"
          grow={grow}
          loading={save.busy}
          onPress={save.run}
        />
      )}
      <Button
        label="To chat"
        icon="messageCircle"
        variant="outlined"
        disabled={chat.hint !== null || player.current === null}
        {...(chat.hint === null ? {} : { hint: chat.hint })}
        onPress={chat.run}
      />
    </View>
  );
}

function Steps({ player }: { readonly player: MemoryPlayerState }): ReactNode {
  const paused = player.position.paused;
  return (
    <View className="flex-row items-center gap-3">
      <IconButton
        icon="chevronLeft"
        label="Previous photo"
        variant="overlay"
        shortcut="Left arrow"
        onPress={() => {
          player.step(-1);
        }}
      />
      <IconButton
        icon={paused ? 'play' : 'pause'}
        label={paused ? 'Play' : 'Pause'}
        variant="filled"
        size="touch"
        shortcut="Space"
        onPress={player.toggle}
      />
      <IconButton
        icon="chevronRight"
        label="Next photo"
        variant="overlay"
        shortcut="Right arrow"
        onPress={() => {
          player.step(1);
        }}
      />
    </View>
  );
}

function Zone({
  label,
  onPress,
  onHold,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly onHold: (held: boolean) => void;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1"
      onPress={onPress}
      onLongPress={() => {
        onHold(true);
      }}
      onPressOut={() => {
        onHold(false);
      }}
    />
  );
}

function TapZones({ player }: { readonly player: MemoryPlayerState }): ReactNode {
  return (
    <View className="absolute inset-0 flex-row">
      <Zone
        label="Previous photo"
        onHold={player.hold}
        onPress={() => {
          player.step(-1);
        }}
      />
      <Zone
        label={player.position.paused ? 'Play' : 'Pause'}
        onHold={player.hold}
        onPress={player.toggle}
      />
      <Zone
        label="Next photo"
        onHold={player.hold}
        onPress={() => {
          player.step(1);
        }}
      />
    </View>
  );
}

function TopBar({
  player,
  onClose,
}: {
  readonly player: MemoryPlayerState;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View pointerEvents="box-none" className="gap-3">
      <PlayerProgress
        index={player.position.index}
        total={player.total}
        progress={player.progress}
      />
      <View pointerEvents="box-none" className="flex-row">
        <IconButton icon="close" label="Close" variant="overlay" shortcut="Esc" onPress={onClose} />
      </View>
    </View>
  );
}

function PhoneFooter({ memory, player }: PartProps): ReactNode {
  return (
    <View pointerEvents="box-none" className="gap-4">
      <Caption memory={memory} player={player} compact />
      <Actions memory={memory} player={player} grow />
      <Text variant="caption" tone="variant" align="center">
        {PLAYER_HINT}
      </Text>
    </View>
  );
}

function DesktopFooter({ memory, player }: PartProps): ReactNode {
  return (
    <View pointerEvents="box-none" className="flex-row items-end gap-3">
      <Caption memory={memory} player={player} compact={false} />
      <View className="ml-auto flex-row items-center gap-3">
        <Steps player={player} />
        <View className="h-7 w-px bg-white/20" />
        <Actions memory={memory} player={player} grow={false} />
      </View>
    </View>
  );
}

function Chrome({
  memory,
  player,
  compact,
  onClose,
}: PartProps & { readonly compact: boolean; readonly onClose: () => void }): ReactNode {
  return (
    <View
      pointerEvents="box-none"
      className={cn(
        'flex-1 justify-between',
        compact ? 'px-3 pt-safe-offset-3 pb-safe-offset-8' : 'px-8 pt-6 pb-8',
      )}
    >
      <TopBar player={player} onClose={onClose} />
      {compact ? (
        <PhoneFooter memory={memory} player={player} />
      ) : (
        <DesktopFooter memory={memory} player={player} />
      )}
    </View>
  );
}

export interface MemoryPlayerProps {
  readonly memory: Memory;
  readonly compact: boolean;
  readonly onClose: () => void;
}

function Screen({ memory, compact, onClose }: MemoryPlayerProps): ReactNode {
  const player = useMemoryPlayer(memory, true);
  const shown = useOverlayShown();
  return (
    <ThemeScope theme="dark">
      <View accessibilityViewIsModal onLayout={shown} className="flex-1 bg-black">
        <PlayerStage
          current={player.current}
          previous={player.previous}
          progress={player.progress}
        />
        {compact ? <TapZones player={player} /> : null}
        <Chrome memory={memory} player={player} compact={compact} onClose={onClose} />
      </View>
    </ThemeScope>
  );
}

export function MemoryPlayer({ memory, compact, onClose }: MemoryPlayerProps): ReactNode {
  return (
    <Overlay open onClose={onClose} label={`Play ${memoryTitle(memory)}`} scrim={false}>
      <Screen memory={memory} compact={compact} onClose={onClose} />
    </Overlay>
  );
}
