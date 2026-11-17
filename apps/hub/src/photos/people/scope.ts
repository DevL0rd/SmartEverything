import type { LibraryScope } from '@smarteverything/domain';
import { driveAnyMatchOf, driveMatchOf, searchWordsOf } from '../../drive/search';
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

function likeEscaped(word: string): string {
  return word.replace(/[\\%_]/gu, (char) => `\\${char}`);
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const LETTERS = 26;

const REGIONS: readonly { readonly code: string; readonly name: string }[] = Array.from(
  { length: LETTERS * LETTERS },
  (_, index) =>
    `${String.fromCharCode(65 + Math.floor(index / LETTERS))}${String.fromCharCode(65 + (index % LETTERS))}`,
).flatMap((code) => {
  const name = regionNames.of(code);
  return name === undefined || name === code ? [] : [{ code, name: name.toLowerCase() }];
});

function countryCodesOf(words: readonly string[]): string[] {
  return REGIONS.filter((region) => words.some((word) => region.name.includes(word))).map(
    (region) => region.code,
  );
}

function containing(
  words: readonly string[],
  slot: string,
  expressions: readonly string[],
): ScopeStatement {
  const parameters: Record<string, string> = {};
  const clauses = words.flatMap((word, index) => {
    const name = `${slot}${String(index)}`;
    parameters[name] = `%${likeEscaped(word)}%`;
    return expressions.map((expression) => `${expression} like $${name} escape '\\'`);
  });
  return { text: clauses.join(' or '), parameters };
}

function analysisArm(words: readonly string[]): ScopeStatement {
  const texts = containing(words, 'analysisText', [
    "lower(coalesce(pa.caption, ''))",
    "lower(coalesce(pa.scene, ''))",
    "lower(coalesce(pa.text, ''))",
  ]);
  const labels = containing(words, 'analysisLabel', ['lower(pl.value)']);
  return {
    text: `select pa.item_id from photo_analysis pa
      join drive_items di on di.id = pa.item_id and di.rev = pa.rev
      where pa.state = 'done' and (${texts.text}
        or exists (select 1 from json_each(pa.labels) pl where ${labels.text}))`,
    parameters: { ...texts.parameters, ...labels.parameters },
  };
}

function groupArm(words: readonly string[], profileId: string): ScopeStatement {
  const names = containing(words, 'groupLike', [
    "lower(coalesce(gg.name, ''))",
    "lower(coalesce(gg.species, ''))",
  ]);
  return {
    text: `select gf_f.item_id from photo_faces gf_f
      join photo_group_faces gf on gf.face_id = gf_f.id
      join photo_groups gg on gg.id = gf.group_id
      where gg.profile_id = $meaningProfile and gf.profile_id = $meaningProfile
        and gf.source <> 'rejected' and gg.hidden = 0 and (${names.text})`,
    parameters: { ...names.parameters, meaningProfile: profileId },
  };
}

function placeArm(words: readonly string[]): ScopeStatement {
  const names = containing(words, 'placeLike', ['lower(p.name)', "lower(coalesce(p.admin, ''))"]);
  return {
    text: `select dm.item_id from drive_media dm
      join drive_places p on p.id = dm.place_id
      where ${names.text} or p.country in (select value from json_each($meaningCountries))`,
    parameters: {
      ...names.parameters,
      meaningCountries: JSON.stringify(countryCodesOf(words)),
    },
  };
}

function dayArms(words: readonly string[]): readonly ScopeStatement[] {
  const days = words.filter((word) => /^\d{1,2}$/u.test(word) && Number(word) <= 31);
  if (days.length === 0) return [];
  return [
    {
      text: `select di.id from drive_items di
        where cast(strftime('%d', di.taken_at) as integer) in (select value from json_each($meaningDays))`,
      parameters: { meaningDays: JSON.stringify(days.map(Number)) },
    },
  ];
}

function meaningStatement(
  text: string,
  itemIds: readonly string[],
  profileId: string,
): ScopeStatement {
  const match = driveAnyMatchOf(text);
  const words = searchWordsOf(text);
  const found: readonly ScopeStatement[] =
    match === null
      ? []
      : [
          { text: `${NAME_AND_LABEL_WORDS} $meaningMatch`, parameters: { meaningMatch: match } },
          { text: `${PHOTO_TEXT_WORDS} $meaningMatch`, parameters: {} },
          analysisArm(words),
          groupArm(words, profileId),
          placeArm(words),
          ...dayArms(words),
        ];
  const arms = [...found.map((part) => part.text), 'select value from json_each($meaningIds)'];
  return {
    text: ` and i.id in (${arms.join(' union ')})`,
    parameters: {
      ...found.reduce<SqlParameters>((all, part) => ({ ...all, ...part.parameters }), {}),
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
  if (scope.meaning !== undefined)
    parts.push(meaningStatement(scope.meaning, meaningItemIds, profileId));
  return {
    text: parts.map((part) => part.text).join(''),
    parameters: parts.reduce<SqlParameters>((all, part) => ({ ...all, ...part.parameters }), {}),
  };
}
