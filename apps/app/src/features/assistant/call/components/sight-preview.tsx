import type { ReactNode } from 'react';
import { PhoneCamera } from './phone-camera';
import type { SightPreviewProps } from './sight-preview-props';

export function SightPreview(props: SightPreviewProps): ReactNode {
  return <PhoneCamera {...props} />;
}
