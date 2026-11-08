import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '../../../design/cn';
import { useIsPhone } from '../../../design/size-class';

export type PanelDock = 'side' | 'bottom';

export const PANEL_LABEL = 'Map editor panel';

export function panelDock(phone: boolean): PanelDock {
  return phone ? 'bottom' : 'side';
}

export type SelectionSurface = 'menu' | 'bar';

export function selectionSurface(dock: PanelDock): SelectionSurface {
  return dock === 'bottom' ? 'bar' : 'menu';
}

export function useSelectionSurface(): SelectionSurface {
  return selectionSurface(panelDock(useIsPhone()));
}

export function panelTop(dock: PanelDock, tools: ReactNode, bar: ReactNode): ReactNode {
  return selectionSurface(dock) === 'bar' && bar !== null ? bar : tools;
}

export interface DockedPanelProps {
  readonly map: ReactNode;
  readonly header: ReactNode;
  readonly tools: ReactNode;
  readonly bar?: ReactNode;
  readonly children: ReactNode;
}

const FRAME: Readonly<Record<PanelDock, string>> = {
  side: 'w-100 shrink-0 border-l-hairline border-outline-variant',
  bottom: 'max-h-1/2 shrink-0 border-t-hairline border-outline-variant',
};

const SHELL: Readonly<Record<PanelDock, string>> = {
  side: 'flex-1 flex-row',
  bottom: 'flex-1 flex-col',
};

function Panel({
  dock,
  header,
  tools,
  bar = null,
  children,
}: Omit<DockedPanelProps, 'map'> & { readonly dock: PanelDock }): ReactNode {
  const top = panelTop(dock, tools, bar);
  const scrollTools = dock === 'bottom' && bar === null;
  return (
    <View
      accessibilityLabel={PANEL_LABEL}
      className={cn('gap-3 bg-surface px-3 pt-3 pb-safe-offset-3', FRAME[dock])}
    >
      {header}
      {scrollTools ? null : top}
      <ScrollView
        className={dock === 'side' ? 'flex-1' : 'min-h-0 grow-0'}
        contentContainerClassName="gap-3 pb-1"
        keyboardShouldPersistTaps="handled"
      >
        {scrollTools ? top : null}
        {children}
      </ScrollView>
    </View>
  );
}

export function DockedPanel(props: DockedPanelProps): ReactNode {
  const dock = panelDock(useIsPhone());
  return (
    <View className={SHELL[dock]}>
      <View className="min-h-0 min-w-0 flex-1 bg-surface-2">{props.map}</View>
      <Panel dock={dock} header={props.header} tools={props.tools} bar={props.bar ?? null}>
        {props.children}
      </Panel>
    </View>
  );
}
