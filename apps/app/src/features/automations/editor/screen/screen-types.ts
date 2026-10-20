import type { LintContext } from '@smarteverything/flow/check/lint';
import type { RunOverlay } from '../../model/canvas/contract';
import type { DocumentStore } from '../../model/editor/document-store';
import type { SceneOptions } from '../host/use-canvas-props';
import type { Insertion } from '../palette/armed-insert';
import type { InspectorBinding } from './editor-panes';

export interface EditorScreenProps {
  readonly store: DocumentStore;
  readonly name: string;
  readonly status: string;
  readonly reusable: boolean;
  readonly online: boolean;
  readonly sentence: string | null;
  readonly run: RunOverlay | null;
  readonly onScreen: boolean;
  readonly options: SceneOptions;
  readonly lint: LintContext;
  readonly inspector: InspectorBinding;
  readonly onBack: () => void;
  readonly onRename: () => void;
  readonly onPublish: () => void;
  readonly onTest: () => void;
  readonly onRuns: () => void;
  readonly onInterface: () => void;
  readonly onInsert: (insertion: Insertion) => void;
  readonly onGroupSelection: (ids: readonly string[]) => void;
}
