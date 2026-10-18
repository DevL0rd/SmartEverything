const session = {
  id: '3f6a2b1c-8d4e-4a90-b1c2-7e5d9a0f1234',
  source: 'camera' as const,
  source_id: 'hallway-camera',
  plugin_id: null,
  title: 'Hallway camera',
  retention_days: 14,
  started_at: '2026-10-14T18:02:11Z',
  ended_at: null,
  last_line_at: '2026-10-14T18:09:40Z',
  line_count: 5,
  participants: ['Dana', 'Sam'],
};

function line(id: number, at: string, speaker: string, text: string) {
  return {
    session,
    line: {
      id,
      session_id: session.id,
      at,
      ended_at: null,
      timing: null,
      speaker_id: speaker.toLowerCase(),
      speaker,
      text,
      bot: false,
    },
  };
}

export const hits = [
  line(
    1,
    '2026-10-14T18:02:20Z',
    'Dana',
    'Did you turn the heating down before we left this morning?',
  ),
  line(
    2,
    '2026-10-14T18:03:05Z',
    'Sam',
    'I think so. The living room was already at nineteen degrees.',
  ),
  line(
    3,
    '2026-10-14T18:05:44Z',
    'Dana',
    'Can you ask the assistant to run the evening lights scene?',
  ),
  line(
    4,
    '2026-10-14T18:07:12Z',
    'Sam',
    'Sure. Evening lights, please, and close the blinds in the bedroom.',
  ),
  line(5, '2026-10-14T18:09:40Z', 'Dana', 'Thanks, that looks much better.'),
];

export function feedState(overrides: Record<string, unknown> = {}) {
  const none = () => undefined;
  return {
    rows: hits,
    words: '',
    settled: '',
    context: false,
    anchor: null,
    missingAnchor: false,
    error: null,
    loading: false,
    fetching: false,
    older: false,
    newer: false,
    loadingOlder: false,
    loadingNewer: false,
    loadOlder: none,
    loadNewer: none,
    refresh: none,
    latest: none,
    back: none,
    changeWords: none,
    open: none,
    ...overrides,
  };
}
