import type { LibraryScope } from '@smarteverything/domain';
import { driveMatchOf } from '../../drive/search';
import type { SqlParameters } from '../../store/sql';

export interface ScopeStatement {
  readonly text: string;
  readonly parameters: SqlParameters;
}

const NOTHING: ScopeStatement = { text: ' and 0', parameters: {} };

const NAME_AND_LABEL_WORDS = `select item_id from drive_items_search where drive_items_search match`;

const PHOTO_TEXT_WORDS = `select item_id from drive_item_text_search where drive_item_text_search match`;

export function isSearching(scope: LibraryScope): boolean {
  const single = [scope.albumId, scope.partnerShareId, scope.text, scope.meaning, scope.photoText];
  return (
    single.some((value) => value !== undefined) ||
    (scope.groupIds?.length ?? 0) > 0 ||
    (scope.labels?.length ?? 0) > 0
  );
}

function groupStatement(groupIds: readonly string[], profileId: string): ScopeStatement {
  const parameters: Record<string, string> = { groupProfile: profileId };
  const clauses = groupIds.map((groupId, index) => {
    parameters[`group${String(index)}`] = groupId;
    return ` and exists (select 1 from photo_faces gf_f
      join photo_group_faces gf on gf.face_id = gf_f.id
      join photo_groups gg on gg.id = gf.group_id
      where gf_f.item_id = i.id and gg.id = $group${String(index)}
        and gg.profile_id = $groupProfile and gf.profile_id = $groupProfile
        and gf.source <> 'rejected')`;
  });
  return { text: clauses.join(''), parameters };
}

function labelStatement(labels: readonly string[]): ScopeStatement {
  const parameters: Record<string, string> = {};
  const clauses = labels.map((label, index) => {
    parameters[`label${String(index)}`] = label.toLowerCase();
    return ` and exists (select 1 from photo_analysis pa, json_each(pa.labels) pl
      where pa.item_id = i.id and pa.rev = i.rev and pa.state = 'done'
        and lower(pl.value) = $label${String(index)})`;
  });
  return { text: clauses.join(''), parameters };
}

function photoTextStatement(text: string): ScopeStatement {
  const match = driveMatchOf(text);
  if (match === null) return NOTHING;
  return {
    text: ` and i.id in (${PHOTO_TEXT_WORDS} $photoTextMatch)`,
    parameters: { photoTextMatch: match },
  };
}

function meaningStatement(text: string, itemIds: readonly string[]): ScopeStatement {
  const match = driveMatchOf(text);
  const arms = [
    ...(match === null
      ? []
      : [`${NAME_AND_LABEL_WORDS} $meaningMatch`, `${PHOTO_TEXT_WORDS} $meaningMatch`]),
    'select value from json_each($meaningIds)',
  ];
  return {
    text: ` and i.id in (${arms.join(' union ')})`,
    parameters: {
      ...(match === null ? {} : { meaningMatch: match }),
      meaningIds: JSON.stringify(itemIds),
    },
  };
}

export function searchNarrowing(
  profileId: string,
  scope: LibraryScope,
  meaningItemIds: readonly string[],
): ScopeStatement {
  const parts: ScopeStatement[] = [];
  if (scope.groupIds !== undefined && scope.groupIds.length > 0)
    parts.push(groupStatement(scope.groupIds, profileId));
  if (scope.labels !== undefined && scope.labels.length > 0)
    parts.push(labelStatement(scope.labels));
  if (scope.photoText !== undefined) parts.push(photoTextStatement(scope.photoText));
  if (scope.meaning !== undefined) parts.push(meaningStatement(scope.meaning, meaningItemIds));
  return {
    text: parts.map((part) => part.text).join(''),
    parameters: parts.reduce<SqlParameters>((all, part) => ({ ...all, ...part.parameters }), {}),
  };
}
