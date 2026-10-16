import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { AiProjectRequest, AiProjectResult } from '@smarteverything/domain';

export type ProjectFilePort = (
  execution: Readonly<ToolExecution>,
  request: AiProjectRequest,
) => Promise<AiProjectResult>;
