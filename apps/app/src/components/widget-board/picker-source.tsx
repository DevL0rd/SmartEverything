import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import type { PickerState } from './types';

type ReadPickerState = () => PickerState;

const SourceContext = createContext<ReadPickerState | null>(null);

class MissingPickerSourceError extends Error {
  override readonly name = 'MissingPickerSourceError';

  constructor() {
    super(
      'The widget gallery needs the home to list lights and groups, but no WidgetPickerSource is mounted above it.',
    );
  }
}

export function WidgetPickerSource({
  read,
  children,
}: {
  readonly read: ReadPickerState;
  readonly children: ReactNode;
}): ReactNode {
  return <SourceContext.Provider value={read}>{children}</SourceContext.Provider>;
}

export function usePickerState(): PickerState {
  const read = useContext(SourceContext);
  if (read === null) {
    throw new MissingPickerSourceError();
  }
  const [state] = useState(read);
  return state;
}
