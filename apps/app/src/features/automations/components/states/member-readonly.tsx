import type { ReactNode } from 'react';
import { Banner } from '../../../../components/banner';
import { STATES_COPY } from './states-copy';

export function MemberReadonly({ author }: { readonly author: string | null }): ReactNode {
  const copy = STATES_COPY.memberReadonly;
  return <Banner tone="info" title={copy.title(author ?? copy.unknownAuthor)} wrapBody />;
}

export function disabledNodeReason(reason: string): string {
  return STATES_COPY.memberReadonly.node(reason);
}
