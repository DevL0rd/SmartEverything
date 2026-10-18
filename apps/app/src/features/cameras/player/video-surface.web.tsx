import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { MediaHandle } from './peer-types';
import { background } from '@smarteverything/logging';

export interface VideoSurfaceProps {
  readonly media: MediaHandle;
  readonly muted: boolean;
  readonly onWheel: ((deltaY: number) => void) | null;
  readonly onFrame: () => void;
  readonly onSoundBlocked: () => void;
}

const LIVE_EDGE_LAG_SECONDS = 3;

export function surfaceReportsFrames(): boolean {
  return true;
}

function liveEdgeOf(buffered: TimeRanges): number | null {
  return buffered.length === 0 ? null : buffered.end(buffered.length - 1);
}

function attachRelay(video: RefObject<HTMLVideoElement | null>, source: MediaSource): () => void {
  const element = video.current;
  if (element === null) {
    return (): void => undefined;
  }
  const url = URL.createObjectURL(source);
  element.src = url;
  const follow = (): void => {
    const end = liveEdgeOf(element.buffered);
    if (end !== null && end - element.currentTime > LIVE_EDGE_LAG_SECONDS) {
      element.currentTime = end - 0.5;
    }
  };
  element.addEventListener('progress', follow);
  return (): void => {
    element.removeEventListener('progress', follow);
    URL.revokeObjectURL(url);
  };
}

function useAttachedMedia(media: MediaHandle): RefObject<HTMLVideoElement | null> {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    const source = media.source;
    if (element === null) {
      return undefined;
    }
    if (source instanceof MediaStream) {
      element.srcObject = source;
      return (): void => {
        element.srcObject = null;
      };
    }
    return source instanceof MediaSource ? attachRelay(video, source) : undefined;
  }, [media]);
  return video;
}

function useFirstFrame(
  video: RefObject<HTMLVideoElement | null>,
  media: MediaHandle,
  onFrame: () => void,
): void {
  useEffect(() => {
    const element = video.current;
    if (element === null) {
      return undefined;
    }
    const handle = element.requestVideoFrameCallback(() => {
      onFrame();
    });
    return (): void => {
      element.cancelVideoFrameCallback(handle);
    };
  }, [video, media, onFrame]);
}

function usePlaying(
  video: RefObject<HTMLVideoElement | null>,
  media: MediaHandle,
  onSoundBlocked: () => void,
): void {
  useEffect(() => {
    const element = video.current;
    if (element === null) {
      return;
    }
    element.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        onSoundBlocked();
        element.muted = true;
        background(element.play(), 'element.play_failed');
      }
    });
  }, [video, media, onSoundBlocked]);
}

function useWheel(
  video: RefObject<HTMLVideoElement | null>,
  onWheel: ((deltaY: number) => void) | null,
): void {
  useEffect(() => {
    const element = video.current;
    if (element === null || onWheel === null) {
      return undefined;
    }
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      onWheel(event.deltaY);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return (): void => {
      element.removeEventListener('wheel', wheel);
    };
  }, [video, onWheel]);
}

export function VideoSurface({
  media,
  muted,
  onWheel,
  onFrame,
  onSoundBlocked,
}: VideoSurfaceProps): ReactNode {
  const video = useAttachedMedia(media);
  usePlaying(video, media, onSoundBlocked);
  useFirstFrame(video, media, onFrame);
  useWheel(video, onWheel);
  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted={muted}
      aria-label="Live camera picture"
      className="absolute inset-0 h-full w-full object-contain"
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
    <video
      src={uri}
      controls
      autoPlay
      playsInline
      aria-label={label}
      className="h-full w-full bg-black object-contain"
    />
  );
}
