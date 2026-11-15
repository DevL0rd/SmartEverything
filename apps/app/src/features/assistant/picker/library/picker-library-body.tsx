import type { ReactNode } from 'react';
import { SearchField } from '../../../../components/search-field';
import { useIdiom } from '../../../../design/platform';
import { LibraryBody, type LibraryBodyProps } from './library-body';
import { useLibraryState } from './library-state';
import { MODEL_SEARCH_PLACEHOLDER } from './library-tools';

export function PickerLibraryBody(body: LibraryBodyProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const state = useLibraryState(body.picker.initialQuery ?? '');
  return (
    <LibraryBody
      {...body}
      state={state}
      searchField={
        <SearchField
          value={state.text}
          onChange={state.setText}
          placeholder={MODEL_SEARCH_PLACEHOLDER}
          variant="field"
          focusOnMount={!touch}
        />
      }
    />
  );
}
