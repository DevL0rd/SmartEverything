import {
  ROBOT_PLUGIN_ID,
  robotMoveLabel,
  type PluginSearchEntry,
  type RobotMoves,
} from '@smarteverything/domain';

const SECTIONS = [
  {
    key: 'robot',
    title: 'AIBI robot status',
    keywords: ['connection', 'firmware', 'network', 'dns'],
  },
  { key: 'conversation', title: 'AIBI conversation', keywords: ['last heard', 'said', 'talk'] },
  { key: 'moves', title: 'AIBI moves', keywords: ['dance', 'actions', 'animations', 'body'] },
  {
    key: 'activity-log',
    title: 'AIBI log',
    keywords: ['activity', 'activity log', 'heard', 'requests', 'firmware'],
  },
] as const;

const KEYWORDS_MAX = 20;
const KEYWORD_LENGTH_MAX = 60;

function keywordsOf(id: string, description: string): string[] {
  const words = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  return [id, ...new Set(words)]
    .map((word) => word.slice(0, KEYWORD_LENGTH_MAX))
    .slice(0, KEYWORDS_MAX);
}

export function aibiSearchEntries(
  externalId: string | null,
  moves: RobotMoves,
): PluginSearchEntry[] {
  if (externalId === null) {
    return [
      {
        id: 'aibi',
        title: 'AIBI robot',
        subtitle: 'Robot companion',
        keywords: ['aibi', 'robot', 'companion', 'dns'],
        target: { kind: 'path', path: `/settings/plugins/${ROBOT_PLUGIN_ID}` },
      },
    ];
  }
  const target = (
    section: string | null,
    query: Record<string, string> = {},
  ): PluginSearchEntry['target'] => ({
    kind: 'device',
    externalId,
    section,
    query,
  });
  return [
    {
      id: 'aibi',
      title: 'AIBI robot',
      subtitle: 'Robot companion',
      keywords: ['aibi', 'robot', 'companion'],
      target: target(null),
    },
    ...SECTIONS.map((section): PluginSearchEntry => ({
      id: `aibi.${section.key}`,
      title: section.title,
      subtitle: 'AIBI robot',
      keywords: [...section.keywords],
      target: target(section.key),
    })),
    ...moves.actions.map((move): PluginSearchEntry => ({
      id: `aibi.move.${move.id}`,
      title: `Make AIBI: ${robotMoveLabel(move.id)}`,
      subtitle: 'AIBI robot move',
      keywords: keywordsOf(move.id, move.description),
      target: target('moves', { move: move.id }),
    })),
  ];
}
