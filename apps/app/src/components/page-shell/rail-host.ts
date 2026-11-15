import { createContext } from 'react';
import { ValueStore } from '../../design/external-store';
import type { ShellSections } from './shell-sections';

interface Shown {
  readonly owner: object;
  readonly sections: ShellSections | null;
}

export class RailHost {
  private readonly shown = new ValueStore<Shown | null>(null);

  readonly subscribe = this.shown.subscribe;

  readonly sections = (): ShellSections | null => {
    const shown = this.shown.get();
    return shown === null ? null : shown.sections;
  };

  readonly show = (owner: object, sections: ShellSections | null): void => {
    const shown = this.shown.get();
    if (shown !== null && shown.owner === owner && shown.sections === sections) return;
    this.shown.set({ owner, sections });
  };

  readonly drop = (owner: object): void => {
    this.shown.update((shown) => (shown !== null && shown.owner === owner ? null : shown));
  };
}

export const RailHostContext = createContext<RailHost | null>(null);
