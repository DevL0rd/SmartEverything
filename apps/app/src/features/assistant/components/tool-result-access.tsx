import { useMemo, useState, type ReactNode } from 'react';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { readFullToolOutput } from '../../../api/ai';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import type { RecordedDiffSource } from '../model/diff-source';
import { RecordedDiffSourceSheet } from './recorded-diff-source';

const log = new Logger('app.assistant');

type Output = Pick<ChatTimelineTool, 'callId' | 'output' | 'output_chars'>;

function useFullOutput(
  chatId: string,
  tool: Output,
): {
  readonly text: string | null;
  readonly loading: boolean;
  readonly load: (then: () => void) => void;
} {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = (then: () => void): void => {
    if (tool.output_chars === undefined || full !== null) {
      then();
      return;
    }
    setLoading(true);
    readFullToolOutput(chatId, tool.callId)
      .then((text) => {
        setFull(text);
        then();
      })
      .catch((error: unknown) => {
        log.error('tool_result.load_failed', error, { chatId, callId: tool.callId });
        notify({ message: 'The tool result could not be loaded', error, tone: 'critical' });
      })
      .finally(() => {
        setLoading(false);
      });
  };
  return { text: full ?? tool.output, loading, load };
}

export function ToolResultAccess({
  chatId,
  tool,
  title,
}: {
  readonly chatId: string;
  readonly tool: Output;
  readonly title: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const { text, loading, load } = useFullOutput(chatId, tool);
  const sources = useMemo<readonly RecordedDiffSource[]>(
    () => (text === null ? [] : [{ label: 'Result', text }]),
    [text],
  );
  if (tool.output === null) return null;
  return (
    <>
      <Interactive
        label="Open tool result"
        onPress={() => {
          load(() => {
            setOpen(true);
          });
        }}
        disabled={loading}
        className="min-h-touch-min justify-center self-start pl-6"
      >
        <Text variant="caption" tone="primary">
          {loading ? 'Loading tool result' : 'Tool result'}
        </Text>
      </Interactive>
      {open ? (
        <RecordedDiffSourceSheet
          title="Tool result"
          path={title}
          sources={sources}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
