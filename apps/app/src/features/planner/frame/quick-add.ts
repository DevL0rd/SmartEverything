import { useState } from 'react';
import type { ComposerKind } from '../item/parse-preview';
import type { PlannerSection } from '../model/section-routes';

export interface ComposerOpening {
  readonly text: string;
  readonly kind: ComposerKind | null;
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

const PLANNER_SECTION_KIND: Readonly<Record<PlannerSection, ComposerKind | null>> = {
  index: null,
  tasks: 'task',
  calendar: 'event',
  insights: null,
};

export function plannerComposerKindOf(section: PlannerSection): ComposerKind | null {
  return PLANNER_SECTION_KIND[section];
}

export function opensComposer(press: ComposerKeyPress, editing: boolean): boolean {
  if (editing || press.ctrlKey || press.metaKey || press.altKey) return false;
  return press.key.toLowerCase() === COMPOSER_KEY;
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
