import type { ComputerRuntimeModel } from '@smarteverything/domain';
import { MODEL_PAGE } from './protocol';
import type { CodexClient } from './client';
import { CodexRuntimeError } from './errors';
export async function modelsOf(
  client: CodexClient,
  deviceId: string,
): Promise<ComputerRuntimeModel[]> {
  const models: ComputerRuntimeModel[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page = MODEL_PAGE.parse(
      await client.request('model/list', {
        limit: 100,
        includeHidden: false,
        ...(cursor === null ? {} : { cursor }),
      }),
    );
    for (const model of page.data)
      models.push({
        runtime: 'codex',
        device_id: deviceId,
        id: model.id,
        resolved_model: model.model,
        name: model.displayName,
        description: model.description,
        efforts: model.supportedReasoningEfforts.map((entry) => entry.reasoningEffort),
        adaptive_thinking: false,
        fast: false,
        available: true,
        reason: null,
        input_modalities: model.inputModalities.filter((modality) => modality !== 'audio'),
        service_tiers: model.serviceTiers.map((tier) => tier.id),
      });
    cursor = page.nextCursor;
    if (cursor !== null && seen.has(cursor))
      throw new CodexRuntimeError('models', 'Codex repeated its model pagination cursor.');
    if (cursor !== null) seen.add(cursor);
    if (models.length > 500)
      throw new CodexRuntimeError('models', 'Codex model catalogue exceeds its bounded capacity.');
  } while (cursor !== null);
  return models;
}
