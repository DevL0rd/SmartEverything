import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AiModelRow } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { useSuggestedModels } from '../../assistant';
import { scopesChange, toggled } from '../model/scopes';
import { EditorSheet, type EditorProps } from './editor-sheet';

function optionsOf(
  suggested: readonly AiModelRow[],
  chosen: readonly string[],
): readonly { readonly id: string; readonly name: string }[] {
  const known = new Map(suggested.map((row) => [row.id, row.name]));
  const ids = [...new Set([...chosen, ...suggested.map((row) => row.id)])];
  return ids.map((id) => ({ id, name: known.get(id) ?? id }));
}

export function ModelsScopeSheet({ access, actions, onClose }: EditorProps): ReactNode {
  const [only, setOnly] = useState(access.scopes.models.mode === 'only');
  const [ids, setIds] = useState<readonly string[]>(access.scopes.models.ids);
  const suggested = useSuggestedModels('chat', null).data;
  const options = optionsOf(
    suggested === undefined
      ? []
      : [...suggested.favourites, ...suggested.recent, ...suggested.top_picks],
    ids,
  );
  return (
    <EditorSheet
      title="AI models"
      intro="Pick which models this person may talk to. Without a limit they use whatever the home uses."
      disabled={only ? ids.length === 0 : false}
      onClose={onClose}
      onSave={() => {
        actions
          .change(
            access.profile_id,
            scopesChange(access, { models: { mode: only ? 'only' : 'default', ids: [...ids] } }),
          )
          .catch(notifyFailure('The models were not saved'));
      }}
    >
      <SwitchRow title="Only the models ticked below" value={only} onChange={setOnly} />
      {only ? (
        <List title="Models">
          {options.map((option) => (
            <SwitchRow
              key={option.id}
              title={option.name}
              subtitle={option.id}
              value={ids.includes(option.id)}
              onChange={() => {
                setIds((now) => toggled(now, option.id));
              }}
            />
          ))}
        </List>
      ) : null}
    </EditorSheet>
  );
}
