import type { ReactNode } from 'react';
import { GoogleScreen } from '../../../../../src/features/connections/google/google-screen';
import { useGoogleLinkFlow } from '../../../../../src/features/connections/google/link-flow-hook';

export default function GoogleRoute(): ReactNode {
  return <GoogleScreen useLink={useGoogleLinkFlow} />;
}
