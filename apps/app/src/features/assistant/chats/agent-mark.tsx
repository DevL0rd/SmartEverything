import type { ReactNode } from 'react';
import { Icon } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { helperActive, type ChatEntry } from './chat-entry';

function toneOf(entry: ChatEntry): Tone {
  if (entry.requests > 0) return 'warning';
  if (entry.line.kind === 'failed') return 'critical';
  return helperActive(entry) ? 'info' : 'variant';
}

export function AgentMark({ entry }: { readonly entry: ChatEntry }): ReactNode {
  return <Icon name="sparkles" size={16} tone={toneOf(entry)} />;
}
