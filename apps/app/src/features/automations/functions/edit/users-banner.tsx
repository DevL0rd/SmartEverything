import type { ReactNode } from 'react';
import { Banner } from '../../../../components/banner';
import { placesText } from '../library/library-model';

export interface UsersBannerProps {
  readonly users: number;
}

export function UsersBanner({ users }: UsersBannerProps): ReactNode {
  if (users === 0) return null;
  return (
    <Banner
      tone="info"
      title={`Used in ${placesText(users)}`}
      body="Saving updates them on their next run."
      wrapBody
    />
  );
}
