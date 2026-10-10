import type { ReactNode } from 'react';
import { MediaStream, RTCView } from 'react-native-webrtc';
import * as WebBrowser from 'expo-web-browser';
import { withUniwind } from 'uniwind';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { notify } from '../../../components/toast-store';
import type { MediaHandle } from './peer-types';

const StyledRTCView = withUniwind(RTCView);

export interface VideoSurfaceProps {
  readonly media: MediaHandle;
  readonly muted: boolean;
  readonly onWheel: ((deltaY: number) => void) | null;
  readonly onFrame: () => void;
  readonly onSoundBlocked: () => void;
}

export function surfaceReportsFrames(): boolean {
  return false;
}

export function VideoSurface({ media }: VideoSurfaceProps): ReactNode {
  if (!(media.source instanceof MediaStream)) {
    return null;
  }
  return (
    <StyledRTCView
      accessibilityLabel="Live camera picture"
      streamURL={media.source.toURL()}
      objectFit="contain"
      className="absolute inset-0"
    />
  );
}

export function ClipSurface({
  uri,
  label,
}: {
  readonly uri: string;
  readonly label: string;
}): ReactNode {
  return (
    <EmptyState
      icon="film"
      title={label}
      body="Clips play in your phone’s video player."
      action={
        <Button
          label="Play clip"
          icon="play"
          onPress={() => {
            WebBrowser.openBrowserAsync(uri).catch((error: unknown) => {
              notify({
                message: 'The clip didn’t open',
                error,
                tone: 'critical',
              });
            });
          }}
        />
      }
    />
  );
}
