import type { ReactNode } from 'react';
import { Skeleton } from '../../../components/skeleton';

export function MediaSkeleton(): ReactNode {
  return (
    <Skeleton shape="block" className="aspect-video w-full max-w-3xl rounded-none bg-surface-2" />
  );
}
