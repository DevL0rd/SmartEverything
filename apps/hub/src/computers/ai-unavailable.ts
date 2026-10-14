import type { ComputerAiCapabilities } from '@smarteverything/domain';
export const UNAVAILABLE_CLAUDE: ComputerAiCapabilities = {
  runtime_version: null,
  operations: [],
  settings: [],
  control_reason: 'This computer has not reported its Claude capabilities.',
  provider_reason: 'This computer has not reported its Claude provider capabilities.',
};
