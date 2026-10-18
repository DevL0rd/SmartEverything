import type {
  ListeningSource,
  ListeningSourceChange,
  ListeningView,
} from '@smarteverything/domain';

function writingOf(source: ListeningSource, transcribe: boolean): ListeningSource['writing'] {
  if (!transcribe) return { state: 'off' };
  return source.writing.state === 'off' ? { state: 'on' } : source.writing;
}

function patchedSource(
  source: ListeningSource,
  change: ListeningSourceChange,
): ListeningSource {
  const transcribe = change.transcribe ?? source.transcribe;
  return {
    ...source,
    wake: change.wake ?? source.wake,
    transcribe,
    sensitivity: change.sensitivity ?? source.sensitivity,
    ...(change.power_mode === undefined ? {} : { power_mode: change.power_mode }),
    writing: writingOf(source, transcribe),
  };
}

export function patchedView(
  view: ListeningView,
  key: string,
  change: ListeningSourceChange,
): ListeningView {
  return {
    ...view,
    sources: view.sources.map((source) =>
      source.key === key ? patchedSource(source, change) : source,
    ),
  };
}

export function replacedSource(view: ListeningView, answer: ListeningSource): ListeningView {
  return {
    ...view,
    sources: view.sources.map((source) => (source.key === answer.key ? answer : source)),
  };
}
