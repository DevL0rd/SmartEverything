import type { ReactNode } from 'react';
import { RemoteKey } from './remote-key';
import type { Television } from './use-television';

type PlayLook = 'disc' | 'round' | 'play';

export function PlayPauseKeys({
  tv,
  look,
  emphasis = false,
}: {
  readonly tv: Television;
  readonly look: PlayLook;
  readonly emphasis?: boolean;
}): ReactNode {
  const { view } = tv;
  if (view.playback === null) {
    return (
      <>
        <RemoteKey tv={tv} name="play" icon="play" look={look} label="Play" />
        <RemoteKey tv={tv} name="pause" icon="pause" look={look} label="Pause" />
      </>
    );
  }
  const playing = view.playback === 'playing';
  return (
    <RemoteKey
      tv={tv}
      name="play_pause"
      icon={playing ? 'pause' : 'play'}
      look={look}
      label={playing ? 'Pause' : 'Play'}
      emphasis={emphasis}
    />
  );
}

export function playPauseReachable(tv: Television): boolean {
  const { locks, playback } = tv.view;
  return playback === null
    ? locks.play === undefined || locks.pause === undefined
    : locks.play_pause === undefined;
}
