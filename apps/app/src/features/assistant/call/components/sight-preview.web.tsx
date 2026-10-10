import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { cn } from '../../../../design/cn';
import { useCallPreviews } from '../preview-store';
import type { SightPreviewProps } from './sight-preview-props';

export function SightPreview({ slot, fit, label }: SightPreviewProps): ReactNode {
  const preview = useCallPreviews()[slot];
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = video.current;
    if (element !== null) {
      element.srcObject = preview?.stream ?? null;
    }
  }, [preview]);
  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted
      aria-label={label}
      style={preview?.mirrored === true ? { transform: 'scaleX(-1)' } : undefined}
      className={cn(
        'absolute inset-0 h-full w-full',
        fit === 'cover' ? 'object-cover' : 'object-contain',
      )}
    />
  );
}
