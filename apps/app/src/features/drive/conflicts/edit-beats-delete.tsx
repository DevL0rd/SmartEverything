import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { PREFS, usePref } from '../../../store/prefs';
import { EDIT_BEATS_DELETE_BODY, EDIT_BEATS_DELETE_TITLE, GOT_IT } from './conflict-model';

export function EditBeatsDeleteRow(): ReactNode {
  const hints = usePref(PREFS.driveHints);
  if (hints.status !== 'ready' || hints.value.editBeatsDeleteSeen) return null;
  return (
    <ListRow
      title={EDIT_BEATS_DELETE_TITLE}
      subtitle={EDIT_BEATS_DELETE_BODY}
      wrapSubtitle
      icon="info"
      iconTone="info"
      trailing={
        <Button
          label={GOT_IT}
          variant="text"
          onPress={() => {
            hints.set({ ...hints.value, editBeatsDeleteSeen: true });
          }}
        />
      }
    />
  );
}
