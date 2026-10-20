import type { ReactNode } from 'react';
import { paletteOpen } from '../palette/armed-insert';
import { EditorBody } from './editor-body';
import { EditorShortcuts, EditorTopBar, OfflineBanner } from './editor-chrome';
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
        banner={<OfflineBanner online={model.props.online} />}
        onBodyLayout={model.onBodyLayout}
        left={
          wide ? (
            <PaletteDock
              host={model.palette}
              open={paletteOpen(model.insertion.state)}
              onOpen={() => {
                model.insertion.open(null);
              }}
              pane={pane}
            />
          ) : null
        }
        body={<EditorBody model={model} />}
        float={wide ? null : <PaletteHost {...model.palette} />}
        right={
          <>
            {wide ? <ProblemsDock host={model.problems} pane={pane} /> : null}
            <InspectorDock host={{ ...model.inspector, docked: true }} pane={pane} />
          </>
        }
      />
      {wide ? null : <ProblemsPhone host={model.problems} />}
      <EditorShortcuts model={model} />
    </>
  );
}
