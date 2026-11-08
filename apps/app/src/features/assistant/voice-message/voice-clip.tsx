import { useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { AssistantAttachment } from '@smarteverything/domain';
import type { ViewportVisibility } from '../../../design/viewport';
import { useOnScreen } from '../../../design/visibility';
import type { ParticipantInk } from '../model/participant';
import { ClipWaveform } from './clip-waveform';
import { useClipPlayback } from './use-clip-playback';
import { usePlayheadLevel } from './use-playhead-level';
import { PillTrail, PlayButton, pillFrame } from './voice-pill';
import { pillViewOf, type PillView } from './voice-pill-model';
import { VoiceTranscript } from './voice-pill-transcript';
import { useVoiceTranscriptOpen } from './voice-pill-transcript-state';

const NO_LEVELS: readonly number[] = [];

export interface VoiceClipProps {
  readonly attachment: AssistantAttachment;
  readonly url: string | undefined;
  readonly linkState: 'loading' | 'ready' | 'failed';
  readonly retry: () => void;
  readonly mine: boolean;
  readonly ink: ParticipantInk | null;
}

interface VoicePillState extends ViewportVisibility {
  readonly frame: RefObject<View | null>;
  readonly playback: ReturnType<typeof useClipPlayback>;
  readonly levels: readonly number[];
  readonly view: PillView;
  readonly level: SharedValue<number>;
  readonly open: boolean;
  readonly position: number;
}

function useVoicePill({ attachment, url, linkState, mine }: VoiceClipProps): VoicePillState {
  const frame = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(frame);
  const playback = useClipPlayback(url, attachment.id);
  const levels = attachment.levels ?? NO_LEVELS;
  const view = pillViewOf({
    linkState,
    loading: playback.loading,
    failed: playback.failed,
    status: playback.status,
    levelCount: levels.length,
    mine,
    played: playback.played,
  });
  const level = usePlayheadLevel(levels, playback.playhead, view.playing, visible);
  const open = useVoiceTranscriptOpen(attachment.id);
  const position = playback.status?.currentTime ?? 0;
  return { frame, visible, onLayout, playback, levels, view, level, open, position };
}

export function VoiceClip(props: VoiceClipProps): ReactNode {
  const { attachment, retry, mine, ink } = props;
  const { frame, visible, onLayout, playback, levels, view, level, open, position } =
    useVoicePill(props);
  return (
    <View ref={frame} onLayout={onLayout} className="max-w-full">
      <View className={pillFrame(mine)}>
        <PlayButton view={view} ink={ink} level={level} toggle={playback.toggle} />
        <ClipWaveform
          levels={levels}
          duration={view.duration}
          position={position}
          scrubbable={view.scrubbable}
          playhead={playback.playhead}
          level={level}
          tone={mine ? 'mine' : 'theirs'}
          phase={view.phase}
          onScreen={visible}
          seek={playback.seek}
        />
        <PillTrail
          view={view}
          mine={mine}
          speed={playback.speed}
          cycleSpeed={playback.cycleSpeed}
          retry={() => {
            playback.reset();
            retry();
          }}
        />
      </View>
      {open ? (
        <VoiceTranscript
          text={attachment.transcript}
          share={view.playing && view.duration > 0 ? position / view.duration : -1}
        />
      ) : null}
    </View>
  );
}
