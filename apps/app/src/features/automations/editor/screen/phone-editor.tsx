import type { ReactNode } from 'react';
import { EditorBody } from './editor-body';
import { EditorBanners, EditorShell, EditorShortcuts } from './editor-chrome';
import { InspectorHost, PaletteHost, ProblemsPhone } from './editor-panes';
import { BottomBar } from './bottom-bar';
import { LayoutPhone } from './layout-phone';
import type { EditorModel } from './use-editor-model';

export function PhoneEditor({ model }: { readonly model: EditorModel }): ReactNode {
  return (
    <EditorShell model={model}>
      <LayoutPhone
        banner={<EditorBanners model={model} />}
        body={<EditorBody model={model} />}
        inset={model.inset}
        bottom={<BottomBar items={model.items} onItem={model.onBottomItem} />}
      />
      <PaletteHost {...model.palette} />
      <InspectorHost {...model.inspector} docked={false} />
      <ProblemsPhone host={model.problems} />
      <EditorShortcuts model={model} />
    </EditorShell>
  );
}
