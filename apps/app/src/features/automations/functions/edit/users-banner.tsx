import type { ReactNode } from 'react';
import { Banner } from '../../../../components/banner';
import { placesText } from '../library/library-model';

export interface UsersBannerProps {
  readonly builtin: boolean;
  readonly users: number;
  readonly onCopy: () => void;
}

export function UsersBanner({ builtin, users, onCopy }: UsersBannerProps): ReactNode {
  if (builtin) {
    return (
      <Banner
        tone="info"
        title="Built in, read only"
        body="Make your own copy to change the steps or the interface."
        wrapBody
        action={{ label: 'Make my own copy', onPress: onCopy }}
      />
    );
  }
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
