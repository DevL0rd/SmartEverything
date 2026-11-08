import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { ClipWaveform } from './clip-waveform';
import { useClipPlayback } from './use-clip-playback';
import { usePlayheadLevel } from './use-playhead-level';
import { PillTrail, PlayButton, pillFrame } from './voice-pill';
import { pillViewOf } from './voice-pill-model';
import type { RecordedClip } from './voice-recorder-machine';

export function RecorderPreview({ clip }: { readonly clip: RecordedClip }): ReactNode {
  const playback = useClipPlayback(clip.uri, null);
  const view = pillViewOf({
    linkState: 'ready',
    loading: playback.loading,
    failed: playback.failed,
    status: playback.status,
    levelCount: clip.levels.length,
    mine: false,
    played: playback.played,
  });
  const level = usePlayheadLevel(clip.levels, playback.playhead, view.playing, true);
  return (
    <View className="px-4 pb-3 pt-3.5">
      <View className={cn(pillFrame(false), 'w-full')}>
        <PlayButton view={view} ink={null} level={level} toggle={playback.toggle} />
        <ClipWaveform
          levels={clip.levels}
          duration={view.duration}
          position={playback.status?.currentTime ?? 0}
          scrubbable={view.scrubbable}
          playhead={playback.playhead}
          level={level}
          tone="theirs"
          phase={view.phase}
          onScreen
          seek={playback.seek}
        />
        <PillTrail
          view={view}
          mine={false}
          speed={playback.speed}
          cycleSpeed={playback.cycleSpeed}
          retry={playback.reset}
        />
      </View>
    </View>
  );
}
