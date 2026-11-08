import type { ReactNode } from 'react';
import { anchorOf, dockedOpen } from '../palette/armed-insert';
import { EditorBody } from './editor-body';
import { EditorBanners, EditorShortcuts, EditorTopBar } from './editor-chrome';
import {
  InspectorDock,
  PaletteDock,
  PaletteHost,
  ProblemsDock,
  ProblemsPhone,
} from './editor-panes';
import { LayoutWide } from './layout-wide';
import { SentenceStrip } from './top-bar';
import type { EditorModel } from './use-editor-model';

export function WideEditor({ model }: { readonly model: EditorModel }): ReactNode {
  const wide = model.layout === 'wide';
  const pane = { sizes: model.panes.sizes, onResize: model.panes.resize };
  return (
    <>
      <LayoutWide
        top={<EditorTopBar model={model} />}
        sentence={<SentenceStrip text={model.props.sentence} />}
        banner={<EditorBanners model={model} />}
        left={
          wide ? (
            <PaletteDock
              host={model.palette}
              open={dockedOpen(model.insertion.state)}
              onOpen={model.openPalette}
              pane={pane}
            />
          ) : null
        }
        body={<EditorBody model={model} />}
        float={
          !wide || anchorOf(model.insertion.state) !== null ? (
            <PaletteHost {...model.palette} />
          ) : null
        }
        right={
          <>
            {wide ? <ProblemsDock host={model.problems} pane={pane} /> : null}
            <InspectorDock
              host={{ ...model.inspector, docked: true }}
              pane={pane}
              focusRef={model.focus.inspector}
            />
          </>
        }
      />
      {wide ? null : <ProblemsPhone host={model.problems} />}
      <EditorShortcuts model={model} />
    </>
  );
}
