import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { WidgetFrameBox } from './frame-class';
import type { WidgetDefinition, WidgetRenderProps } from './types';

export interface WidgetActions {
  readonly choose: () => void;
  readonly remove: () => void;
}

const FrameContext = createContext<WidgetFrameBox | null>(null);

const ActionsContext = createContext<WidgetActions | null>(null);

const MemberContext = createContext<string | null>(null);

export function RevealedMember({
  member,
  children,
}: {
  readonly member: string | null;
  readonly children: ReactNode;
}): ReactNode {
  return <MemberContext.Provider value={member}>{children}</MemberContext.Provider>;
}

export function useWidgetFrame(): WidgetFrameBox | null {
  return useContext(FrameContext);
}

export function useWidgetActions(): WidgetActions | null {
  return useContext(ActionsContext);
}

export function renderWidget(
  definition: WidgetDefinition,
  props: WidgetRenderProps,
  actions: WidgetActions | null,
): ReactNode {
  return (
    <FrameContext.Provider value={props.frame}>
      <ActionsContext.Provider value={actions}>{definition.render(props)}</ActionsContext.Provider>
    </FrameContext.Provider>
  );
}

export function renderPreview(
  definition: WidgetDefinition,
  frame: WidgetFrameBox,
  options: unknown,
): ReactNode {
  const preview = definition.preview?.(frame, options) ?? definition.skeleton?.() ?? null;
  return preview === null ? null : (
    <FrameContext.Provider value={frame}>{preview}</FrameContext.Provider>
  );
}
