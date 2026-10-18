import type { ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_AI_HARNESS_PERMISSION,
  harnessTargetKey,
  type AiModelRoute,
  type AiHarnessCatalogue,
  type AiModelRouteModel,
  type AiHarnessHost,
  type DshEngine,
} from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { useHarnessCatalogue, HARNESS_CATALOGUE_KEY } from '../data/harness';
import { useFavouriteModels } from '../data/favourites';
import { keptEffort, type ModelChoice, type ModelPick } from '../picker/model-choice';
import type { CandidateSource, ModelCandidate } from '../data/model-candidates';
import { ModelRow } from '../picker/model-row';
import { useEngineAccessory } from '../chats/engine-accessories';
import { harnessHostReason } from '../model/harness-context';
import { useHarnessHostChoice } from './harness-host-choice';
import { background } from '@smarteverything/logging';

interface Props {
  readonly picked: ModelPick | null;
  readonly models?: readonly ModelChoice[];
  readonly valid?: () => boolean;
  readonly onPick: ((pick: ModelPick) => void) | null;
}
function choice(
  route: AiModelRoute,
  model: AiModelRouteModel,
  catalogue?: ModelChoice,
): ModelChoice {
  if (
    catalogue !== undefined &&
    route.auth.provider === 'openrouter' &&
    catalogue.catalogueSupplier === 'openrouter'
  )
    return {
      ...catalogue,
      supplierLabel: 'OpenRouter',
      billing: route.billing === 'metered' ? 'Metered' : 'Subscription',
    };
  const provider =
    route.auth.provider === 'openrouter' ? model.id.split('/')[0] : route.auth.provider;
  return {
    id: model.id,
    name: model.name,
    ...(route.auth.provider === 'openrouter' ? { catalogueSupplier: 'openrouter' as const } : {}),
    provider: provider ?? '',
    providerLabel: makerLabel(route, provider),
    supplierLabel: {
      anthropic: 'Claude subscription',
      openai: 'ChatGPT plan',
      openrouter: 'OpenRouter account',
    }[route.auth.provider],
    billing: route.billing === 'metered' ? 'Metered' : 'Subscription',
    contextLength: model.capabilities.context_tokens,
    price: { inputPerMillion: null, outputPerMillion: null, variable: false },
    efforts: model.capabilities.efforts,
    latest: false,
    inputs: model.capabilities.input_modalities,
    outputs: model.capabilities.output_modalities,
  };
}
function engineFor(
  host: AiHarnessHost | undefined,
  route: AiModelRoute,
  model: AiModelRouteModel,
  previous: DshEngine | null,
): DshEngine | null {
  const permission = previous?.permission ?? DEFAULT_AI_HARNESS_PERMISSION;
  if (host === undefined || route.state !== 'ready') return null;
  if (!supportsPermission(host, permission)) return null;
  const effort = previous?.effort ?? null;
  return {
    kind: 'dsh',
    execution_target: host.target,
    session_id: previous?.session_id ?? null,
    model_route_id: route.id,
    model: model.id,
    effort: keptEffort(choice(route, model), effort),
    permission,
  };
}
interface CandidateContext {
  readonly host: AiHarnessHost | undefined;
  readonly previous: DshEngine | null;
  readonly props: Props;
  readonly client: QueryClient;
  readonly favorites: ReturnType<typeof useFavouriteModels>;
  readonly catalogue: AiHarnessCatalogue | undefined;
}
function candidate(
  route: AiModelRoute,
  model: AiModelRouteModel,
  context: CandidateContext,
): ModelCandidate {
  const { previous, props, favorites } = context;
  const engine = candidateEngine(route, model, context);
  const selected =
    previous === null
      ? (props.picked?.engine === undefined || props.picked.engine.kind === 'openrouter') &&
        props.picked?.model === model.id &&
        route.auth.provider === 'openrouter'
      : previous.model_route_id === route.id && previous.model === model.id;
  const favourite = favorites.status === 'ready' && favorites.favourites.has(model.id);
  const row = choice(route, model, catalogueChoice(route, model.id, props.models));
  const pick = harnessPick(engine, model.id, context);
  return {
    pick,
    key: `dsh:${route.id}:${model.id}`,
    model: row,
    selected,
    favourite,
    render: (): ReactNode => (
      <>
        <ModelRow
          model={row}
          selected={selected}
          favourite={favourite}
          onPick={pick}
          onFavourite={
            favorites.status === 'ready'
              ? (): void => {
                  if (props.valid?.() !== false) favorites.toggle(model.id);
                }
              : null
          }
        />
        {route.state === 'unavailable' ? (
          <Text variant="footnote" tone="warning" className="px-3 pb-2">
            {route.failure.message}
          </Text>
        ) : null}
      </>
    ),
  };
}
export function useHarnessPicker(props: Props, enabled: boolean): CandidateSource {
  const client = useQueryClient();
  const catalogue = useHarnessCatalogue();
  const favorites = useFavouriteModels();
  const accessory = useEngineAccessory();
  const hostChoice = useHarnessHostChoice(catalogue.data, null);
  const selection = pickerSelection(props.picked, catalogue.data, accessory, hostChoice.key);
  if (!enabled) return { candidates: [], status: null };
  const routes = catalogue.data === undefined ? [] : catalogue.data.routes;
  return {
    candidates: routes.flatMap((route) =>
      route.models
        .filter(
          (model) =>
            route.auth.provider !== 'openrouter' ||
            props.models === undefined ||
            props.models.some((entry) => entry.id === model.id),
        )
        .map((model) =>
          candidate(route, model, {
            ...selection,
            props,
            favorites,
            client,
            catalogue: catalogue.data,
          }),
        ),
    ),
    status:
      catalogue.data === undefined
        ? {
            name: 'account',
            pending: catalogue.isPending,
            error: catalogue.error,
            retry: (): void => {
              background(catalogue.refetch(), 'catalogue.refetch_failed');
            },
          }
        : null,
  };
}

function previousEngine(picked: ModelPick | null): DshEngine | null {
  return picked?.engine?.kind === 'dsh' ? picked.engine : null;
}
function supportsPermission(host: AiHarnessHost, permission: DshEngine['permission']): boolean {
  if (harnessHostReason(host) !== null || host.manifest === null) return false;
  return host.manifest.permissions.some(
    (policy) => policy.sandbox === permission.sandbox && policy.approval === permission.approval,
  );
}

function harnessPick(
  engine: DshEngine | null,
  model: string,
  context: CandidateContext,
): (() => void) | null {
  const onPick = context.props.onPick;
  if (engine === null || onPick === null) return null;
  return (): void => {
    if (context.props.valid?.() === false) return;
    const checked = checkedHarnessEngine(context, engine, model);
    if (checked !== null) onPick({ model, effort: checked.effort, engine: checked });
  };
}

function makerLabel(route: AiModelRoute, provider: string | undefined): string {
  if (route.auth.provider === 'anthropic') return 'Anthropic';
  if (route.auth.provider === 'openai') return 'OpenAI';
  return provider ?? 'Unknown maker';
}

function checkedHarnessEngine(
  context: CandidateContext,
  engine: DshEngine,
  model: string,
): DshEngine | null {
  if (context.client.getQueryState(HARNESS_CATALOGUE_KEY)?.isInvalidated === true) return null;
  const catalogue = context.client.getQueryData<AiHarnessCatalogue>(HARNESS_CATALOGUE_KEY);
  const route = catalogue?.routes.find((row) => row.id === engine.model_route_id);
  const choice = route?.models.find((row) => row.id === model);
  if (route === undefined || choice === undefined) return null;
  const host = catalogue?.hosts.find(
    (row) => harnessTargetKey(row.target) === harnessTargetKey(engine.execution_target),
  );
  return engineFor(host, route, choice, engine);
}
function catalogueChoice(
  route: AiModelRoute,
  id: string,
  models: readonly ModelChoice[] | undefined,
): ModelChoice | undefined {
  return models?.find(
    (model) => model.id === id && model.catalogueSupplier === route.auth.provider,
  );
}

function pickerSelection(
  picked: ModelPick | null,
  catalogue: AiHarnessCatalogue | undefined,
  accessory: ReturnType<typeof useEngineAccessory>,
  defaultKey: string,
): Pick<CandidateContext, 'host' | 'previous'> {
  const previous = previousEngine(picked);
  let key = previous === null ? defaultKey : harnessTargetKey(previous.execution_target);
  if (accessory !== null && (previous === null || accessory.host.draft)) key = accessory.host.key;
  const host = catalogue?.hosts.find((row) => harnessTargetKey(row.target) === key);
  return { host, previous };
}

function candidateEngine(
  route: AiModelRoute,
  model: AiModelRouteModel,
  context: CandidateContext,
): DshEngine | null {
  return engineFor(context.host, route, model, context.previous);
}
