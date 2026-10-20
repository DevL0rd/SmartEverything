import type { ReactNode } from 'react';
import { Banner } from '../../../../components/banner';
import { OFFLINE_BANNER } from './screen-model';
import { ShortcutSheet } from './shortcut-sheet';
import { TopBar } from './top-bar';
import type { EditorModel } from './use-editor-model';

export function EditorTopBar({ model }: { readonly model: EditorModel }): ReactNode {
  const { props: screen, flags, check } = model;
  return (
    <TopBar
      layout={model.layout}
      name={screen.name}
      status={screen.status}
      reusable={screen.reusable}
      online={screen.online}
      counts={check.counts}
      canUndo={flags.canUndo}
      canRedo={flags.canRedo}
      onBack={screen.onBack}
      onRename={screen.onRename}
      onUndo={screen.store.undo}
      onRedo={screen.store.redo}
      onPublish={screen.onPublish}
      onTest={screen.onTest}
      onAdd={() => {
        model.insertion.open(null);
      }}
      onProblems={model.onProblems}
      onShortcuts={() => {
        model.setShortcuts(true);
      }}
    />
  );
}

export function OfflineBanner({ online }: { readonly online: boolean }): ReactNode {
  return online ? null : (
    <Banner tone="warning" title={OFFLINE_BANNER.title} body={OFFLINE_BANNER.body} wrapBody />
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
