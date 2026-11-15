import { useState } from 'react';
import { browserCovered } from '../../../platform/browser-overlays';
import type { ComposerKind } from '../item/parse-preview';
import type { PlannerSection } from '../model/section-routes';

export interface ComposerOpening {
  readonly text: string;
  readonly kind: ComposerKind | null;
  readonly collectionId?: string;
}

export interface ComposerControl {
  readonly opening: ComposerOpening | null;
  readonly open: (opening: ComposerOpening) => void;
  readonly close: () => void;
}

export interface ComposerKeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const COMPOSER_KEY = 'n';

const SEARCH_KEY = '/';

const PLANNER_SECTION_KIND: Readonly<Record<PlannerSection, ComposerKind | null>> = {
  index: null,
  tasks: 'task',
  calendar: 'event',
  insights: null,
  booking: null,
};

export function plannerComposerKindOf(section: PlannerSection): ComposerKind | null {
  return PLANNER_SECTION_KIND[section];
}

export function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function pageKeysHeld(target: EventTarget | null): boolean {
  return isTextEntry(target) || browserCovered.get();
}

export function opensComposer(press: ComposerKeyPress, editing: boolean): boolean {
  if (editing || press.ctrlKey || press.metaKey || press.altKey) return false;
  return press.key.toLowerCase() === COMPOSER_KEY;
}

export function opensSearch(press: ComposerKeyPress, editing: boolean): boolean {
  if (editing || press.ctrlKey || press.metaKey || press.altKey) return false;
  return press.key === SEARCH_KEY;
}

export function useComposerControl(): ComposerControl {
  const [opening, setOpening] = useState<ComposerOpening | null>(null);
  return {
    opening,
    open: setOpening,
    close: (): void => {
      setOpening(null);
    },
  };
}
