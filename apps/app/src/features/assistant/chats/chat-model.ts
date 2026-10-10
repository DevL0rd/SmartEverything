import type { Engine } from '@smarteverything/domain';
import { effortLabel } from '../picker/efforts';
import { useModelLabel } from '../picker/model-label';
import { modelIdName, plainModelName, shortModelName } from '../model/model-name';

export interface ChatModel {
  readonly name: string;
  readonly shortName: string;
  readonly provider: string | null;
  readonly providerLabel: string | null;
  readonly effort: string | null;
  readonly isDefault: boolean;
}

export function useChatModel(engine: Engine): ChatModel {
  const label = useModelLabel(engine);
  const loaded = label.provider !== null;
  const name = loaded ? plainModelName(label.name) : modelIdName(engine.model);
  return {
    name,
    shortName: loaded ? shortModelName(name) : name,
    provider: label.provider,
    providerLabel: label.providerLabel,
    effort: engine.effort === null ? null : effortLabel(engine.effort),
    isDefault: loaded && engine.model === null,
  };
}
