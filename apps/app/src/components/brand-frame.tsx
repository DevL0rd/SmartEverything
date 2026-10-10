import type { ReactNode } from 'react';
import { Path } from 'react-native-svg';

export function Frame({
  fill,
  children,
}: {
  readonly fill: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <>
      <Path
        d="M6 0h12a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6Z"
        fill={fill}
      />
      {children}
    </>
  );
}
