const CHILD_ICONS = ['sparkles', 'leaf', 'star', 'flower', 'focus', 'automations'] as const;
const HASH_FACTOR = 31;

type ChildIcon = (typeof CHILD_ICONS)[number];

export function childChatIcon(id: string): ChildIcon {
  let index = 0;
  for (const character of id) {
    index = (index * HASH_FACTOR + character.charCodeAt(0)) % CHILD_ICONS.length;
  }
  const icon = CHILD_ICONS[index];
  if (icon === undefined) throw new Error(`No child chat icon for index ${String(index)}.`);
  return icon;
}
