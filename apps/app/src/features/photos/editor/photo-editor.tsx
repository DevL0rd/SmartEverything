import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { PhotoEdit } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { cn } from '../../../design/cn';
import { useIsPhone } from '../../../design/size-class';
import type { MediaItem } from '../viewer/info-model';
import { AdjustPanel } from './adjust-panel';
import { shownView, stageOf } from './canvas-view';
import { ratioOf, type Aspect } from './crop-model';
import { CropOverlay } from './crop-overlay';
import { CropPanel } from './crop-panel';
import { EditorStage, type Overlay } from './editor-stage';
import { EraserOverlay, EraserPanel } from './eraser';
import { DEFAULT_BRUSH, type Stroke } from './eraser-model';
import { FilterPanel } from './filter-panel';
import type { Size } from './geometry';
import { useEraserKey, type PatchImages } from './queries';
import { cropped } from './recipe-ops';
import { EDITOR_TOOLS, TOOL_LOOK, type EditorTool } from './tools';
import { TopBar } from './top-bar';
import { useLeaveHandler, usePhotoEditor, type PhotoEditor } from './use-photo-editor';

export interface PhotoEditorProps {
  readonly item: MediaItem;
  readonly edit: PhotoEdit;
  readonly uri: string;
  readonly patchImages: PatchImages;
  readonly initialSource: Size;
}

interface Local {
  readonly source: Size;
  readonly aspect: Aspect;
  readonly brush: number;
  readonly strokes: readonly Stroke[];
}

function ToolBar({
  tool,
  disabled,
  onTool,
}: {
  readonly tool: EditorTool;
  readonly disabled: boolean;
  readonly onTool: (tool: EditorTool) => void;
}): ReactNode {
  return (
    <View accessibilityRole="tablist" className="flex-row px-2 pb-safe-offset-2 pt-2">
      {EDITOR_TOOLS.map((each) => (
        <Interactive
          key={each}
          role="tab"
          label={TOOL_LOOK[each].label}
          selected={each === tool}
          disabled={disabled}
          onPress={() => {
            onTool(each);
          }}
          className="min-h-touch-min flex-1 items-center justify-center gap-1 rounded-md py-1"
          layerClassName="rounded-md"
        >
          <Icon
            name={TOOL_LOOK[each].icon}
            size={24}
            tone={each === tool ? 'primary' : 'default'}
          />
          <Text variant="caption" tone={each === tool ? 'primary' : 'default'}>
            {TOOL_LOOK[each].label}
          </Text>
        </Interactive>
      ))}
    </View>
  );
}

function shareOf(aspect: Aspect, shown: Size): number | null {
  const imageRatio = shown.width / shown.height;
  const ratio = ratioOf(aspect, imageRatio);
  return ratio === null ? null : ratio / imageRatio;
}

function overlayOf(
  editor: PhotoEditor,
  local: Local,
  setLocal: Dispatch<SetStateAction<Local>>,
): Overlay | null {
  if (editor.compare) return null;
  if (editor.tool === 'crop') {
    return function cropLayer(rect, shown): ReactNode {
      return (
        <CropOverlay
          rect={rect}
          box={editor.recipe.crop}
          share={shareOf(local.aspect, shown)}
          onDraft={(box) => {
            editor.draft(cropped(editor.committed, box));
          }}
          onCommit={(box) => {
            editor.commit(cropped(editor.committed, box));
          }}
        />
      );
    };
  }
  if (editor.tool !== 'eraser') return null;
  return function eraserLayer(rect): ReactNode {
    return (
      <EraserOverlay
        rect={rect}
        brush={local.brush}
        strokes={local.strokes}
        disabled={editor.erasing}
        onStroke={(stroke) => {
          setLocal((current) => ({ ...current, strokes: [...current.strokes, stroke] }));
        }}
      />
    );
  };
}

function ToolPanel({
  editor,
  local,
  setLocal,
  uri,
  side,
}: {
  readonly editor: PhotoEditor;
  readonly local: Local;
  readonly setLocal: Dispatch<SetStateAction<Local>>;
  readonly uri: string;
  readonly side: boolean;
}): ReactNode {
  const hasKey = useEraserKey(editor.tool === 'eraser');
  if (editor.tool === 'adjust') return <AdjustPanel editor={editor} />;
  if (editor.tool === 'filters')
    return <FilterPanel editor={editor} uri={uri} source={local.source} wrap={side} />;
  if (editor.tool === 'eraser') {
    return (
      <EraserPanel
        editor={editor}
        brush={local.brush}
        strokes={local.strokes}
        hasKey={hasKey}
        onBrush={(brush) => {
          setLocal((current) => ({ ...current, brush }));
        }}
        onUndoStroke={() => {
          setLocal((current) => ({ ...current, strokes: current.strokes.slice(0, -1) }));
        }}
        onErase={() => {
          editor.erase(local.strokes, () => {
            setLocal((current) => ({ ...current, strokes: [] }));
          });
        }}
      />
    );
  }
  const shown = shownView(editor.committed, local.source, 'crop').size;
  return (
    <CropPanel
      editor={editor}
      aspect={local.aspect}
      imageRatio={shown.width / shown.height}
      onAspect={(aspect) => {
        setLocal((current) => ({ ...current, aspect }));
      }}
    />
  );
}

function CopyOnly({ reason }: { readonly reason: string | null }): ReactNode {
  if (reason === null) return null;
  return (
    <View className="mx-4 mb-2 flex-row items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
      <Icon name="info" size={18} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {reason}
      </Text>
    </View>
  );
}

function Panel(props: {
  readonly editor: PhotoEditor;
  readonly local: Local;
  readonly setLocal: Dispatch<SetStateAction<Local>>;
  readonly uri: string;
  readonly side: boolean;
}): ReactNode {
  const { editor } = props;
  return (
    <View className={cn('bg-black', props.side ? 'w-96 border-l border-outline-variant' : '')}>
      <ScrollView className={props.side ? 'flex-1' : ''} contentContainerClassName="py-3">
        <ToolPanel {...props} />
      </ScrollView>
      <ToolBar
        tool={editor.tool}
        disabled={editor.saving || editor.erasing}
        onTool={editor.setTool}
      />
    </View>
  );
}

export function PhotoEditorView(props: PhotoEditorProps): ReactNode {
  const editor = usePhotoEditor(props.edit, props.patchImages);
  const phone = useIsPhone();
  const [local, setLocal] = useState<Local>({
    source: props.initialSource,
    aspect: 'free',
    brush: DEFAULT_BRUSH,
    strokes: [],
  });
  useEscape(true, editor.leave);
  useLeaveHandler(editor.leave);
  const stage = (
    <EditorStage
      uri={props.uri}
      patches={editor.patches}
      recipe={editor.recipe}
      stage={stageOf(editor.tool, editor.compare)}
      source={local.source}
      label={`Editing ${props.item.name}`}
      overlay={overlayOf(editor, local, setLocal)}
      onSource={(source) => {
        setLocal((current) => ({ ...current, source }));
      }}
    />
  );
  return (
    <View className="flex-1 bg-black">
      <TopBar
        title={props.item.name}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        dirty={editor.dirty}
        saving={editor.saving}
        busy={editor.saving || editor.erasing}
        canSaveVersion={props.edit.canSaveVersion}
        compare={editor.compare}
        onCancel={editor.leave}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onCompare={editor.setCompare}
        onSave={editor.save}
      />
      <CopyOnly reason={props.edit.copyOnlyReason} />
      <View className={cn('min-h-0 flex-1', phone ? '' : 'flex-row')}>
        {stage}
        <Panel editor={editor} local={local} setLocal={setLocal} uri={props.uri} side={!phone} />
      </View>
    </View>
  );
}
