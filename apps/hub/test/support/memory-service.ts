import type { AiMemory, AiMemoryAdd, AiMemoryLine, AiMemoryRecall } from '@smarteverything/domain';
import type { MemoryPrincipal } from '../../src/memory/principal';
import type { MemoryService } from '../../src/memory/service';

export async function remember(
  service: MemoryService,
  who: MemoryPrincipal,
  input: AiMemoryAdd,
): Promise<AiMemory> {
  return (await service.add(who, input)).memory;
}

export function everyone(recall: AiMemoryRecall): AiMemoryLine[] {
  return [
    ...recall.core,
    ...recall.vocabulary,
    ...recall.relevant,
    ...recall.recent,
    ...recall.today,
    ...recall.week,
    ...recall.month,
    ...recall.year,
  ];
}
