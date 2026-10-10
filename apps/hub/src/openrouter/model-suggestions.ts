import {
  ApiError,
  AUTO_LATEST_GEMINI_FLASH,
  CLIENT_PREFS,
  type AiModelChoice,
  type AiModelKind,
  type AiModelRow,
  type AiModelSuggested,
} from "@smarteverything/domain";
import type {
  LayoutOwner,
  PersonalRepository,
} from "../store/repositories/personal";
import type { Catalogue } from "./catalogue";
import type { AiModelsRepository } from "./models-repository";

const RECENT_COUNT = 6;
const DATED_ID = /-\d{8}$/;

export interface SuggestionRequest {
  readonly owner: LayoutOwner;
  readonly kind: AiModelKind;
  readonly current: AiModelChoice | undefined;
}

export interface SuggestionDeps {
  readonly catalogue: Catalogue;
  readonly models: AiModelsRepository;
  readonly personal: PersonalRepository;
}

function favouriteIds(
  personal: PersonalRepository,
  owner: LayoutOwner,
): readonly string[] {
  const pref = CLIENT_PREFS.ai_models;
  const read = pref.decode(personal.layout(owner, pref.storageKey)?.layout);
  if (read.status === "invalid") {
    throw new ApiError("conflict", read.reason);
  }
  return read.value.favourites;
}

function rowsFor(
  catalogue: Catalogue,
  ids: readonly string[],
  kind: AiModelKind,
): AiModelRow[] {
  const seen = new Set<string>();
  const rows: AiModelRow[] = [];
  for (const id of ids) {
    const row =
      catalogue.usable(id) ?? catalogue.usable(id.replace(DATED_ID, ""));
    if (row !== null && row.kinds.includes(kind) && !seen.has(row.id)) {
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

function currentOf(
  catalogue: Catalogue,
  current: AiModelChoice | undefined,
): AiModelRow | null {
  if (current === undefined) {
    return null;
  }
  return current === AUTO_LATEST_GEMINI_FLASH
    ? catalogue.model(catalogue.resolve(current, null).model_id)
    : catalogue.model(current);
}

export function suggestionsOf(
  deps: SuggestionDeps,
  request: SuggestionRequest,
): AiModelSuggested {
  const { catalogue } = deps;
  const overview = catalogue.overview();
  const defaultId = overview.default?.model_id;
  return {
    synced_at: overview.synced_at,
    sync_error: overview.sync_error,
    default: overview.default,
    default_model: defaultId === undefined ? null : catalogue.usable(defaultId),
    current: currentOf(catalogue, request.current),
    favourites: rowsFor(
      catalogue,
      favouriteIds(deps.personal, request.owner),
      request.kind,
    ),
    recent: rowsFor(
      catalogue,
      deps.models.recentModelIds(request.owner.profileId),
      request.kind,
    ).slice(0, RECENT_COUNT),
    top_picks: catalogue.topPicks(request.kind),
  };
}
