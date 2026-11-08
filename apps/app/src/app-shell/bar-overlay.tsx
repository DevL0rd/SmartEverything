import type { ReactNode } from 'react';
import { useState } from 'react';
import { measureAnchor, type Rect } from '../components/anchor';
import { Menu } from '../components/menu';
import type { NavEdits } from './nav-edit-actions';
import { navEditor } from './nav-edit-state';
import { FolderTray } from './folder-tray';
import { slotMenuItems } from './nav-slot-menu';
import type { NavEntry, NavModel, NavNodeView } from './nav-model';
import type { SlotAnchor } from './bar-slot';

type OverlayKind = 'folder' | 'menu';

type OpenOverlay =
  | { readonly kind: 'folder'; readonly key: string }
  | { readonly kind: 'menu'; readonly key: string; readonly anchor: Rect };

export interface BarOverlayControl {
  readonly open: OpenOverlay | null;
  readonly show: (kind: OverlayKind) => (slot: SlotAnchor) => void;
  readonly close: () => void;
}

export function useBarOverlay(): BarOverlayControl {
  const [open, setOpen] = useState<OpenOverlay | null>(null);
  return {
    open,
    show: (kind) => (slot) => {
      if (kind === 'folder') {
        setOpen({ kind, key: slot.node.key });
        return;
      }
      measureAnchor(slot.ref, (anchor) => {
        setOpen({ kind, key: slot.node.key, anchor });
      });
    },
    close: (): void => {
      setOpen(null);
    },
  };
}

export interface BarOverlayProps {
  readonly control: BarOverlayControl;
  readonly model: NavModel;
  readonly edits: NavEdits;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
}

function nodeOf(model: NavModel, key: string): NavNodeView | undefined {
  return model.bar.find((node) => node.key === key);
}

export function BarOverlay({ control, model, edits, go, intent }: BarOverlayProps): ReactNode {
  const { open, close } = control;
  const node = open === null ? undefined : nodeOf(model, open.key);
  if (open === null || node === undefined) return null;
  if (open.kind === 'folder') {
    return node.kind === 'folder' ? (
      <FolderTray folder={node} go={go} intent={intent} onClose={close} />
    ) : null;
  }
  const items = slotMenuItems(node, {
    overflow: model.overflow,
    edits,
    openEditor: navEditor.set,
  });
  if (items.length === 0) return null;
  return (
    <Menu items={items} options={{}} anchor={open.anchor} label={node.title} onClose={close} />
  );
}
