import type { ReactNode } from 'react';
import { PageShell } from '../../../../components/page-shell/page-shell';
import { ShortcutSheet } from './shortcut-sheet';
import { TopBarActions, TopBarTitle, type TopBarProps } from './top-bar';
import type { EditorModel } from './use-editor-model';

function topBarPropsOf(model: EditorModel): TopBarProps {
  const { props: screen, flags, check } = model;
  return {
    layout: model.layout,
    name: screen.name,
    status: screen.status,
    reusable: screen.reusable,
    online: screen.online,
    empty: flags.empty,
    counts: check.counts,
    canUndo: flags.canUndo,
    canRedo: flags.canRedo,
    onBack: screen.onBack,
    onRename: screen.onRename,
    onUndo: screen.store.undo,
    onRedo: screen.store.redo,
    onPublish: screen.onPublish,
    onTest: screen.onTest,
    onAdd: model.openPalette,
    onProblems: model.onProblems,
    onShortcuts: (): void => {
      model.setShortcuts(true);
    },
  };
}

export function EditorShell({
  model,
  children,
}: {
  readonly model: EditorModel;
  readonly children: ReactNode;
}): ReactNode {
  const bar = topBarPropsOf(model);
  return (
    <PageShell
      variant="pane"
      title={bar.name}
      onBack={bar.onBack}
      heading={<TopBarTitle {...bar} focusRef={model.focus.topBar} />}
      trailing={<TopBarActions {...bar} />}
    >
      {children}
    </PageShell>
  );
}

export function EditorShortcuts({ model }: { readonly model: EditorModel }): ReactNode {
  return (
    <ShortcutSheet
      open={model.shortcuts}
      onClose={() => {
        model.setShortcuts(false);
      }}
    />
  );
}
