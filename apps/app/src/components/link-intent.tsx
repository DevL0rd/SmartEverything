import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { AppHref } from './app-href';

export type LinkIntent = (href: AppHref) => void;

const LinkIntentContext = createContext<LinkIntent>(() => undefined);

export function LinkIntentProvider({
  onIntent,
  children,
}: {
  readonly onIntent: LinkIntent;
  readonly children: ReactNode;
}): ReactNode {
  return <LinkIntentContext.Provider value={onIntent}>{children}</LinkIntentContext.Provider>;
}

export function useLinkIntent(): LinkIntent {
  return useContext(LinkIntentContext);
}
