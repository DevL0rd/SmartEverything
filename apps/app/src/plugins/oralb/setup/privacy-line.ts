export function privacyLine(person: string | null): string {
  return person === null
    ? 'Sessions on this brush stay private to the owner until you choose who uses it.'
    : `Only ${person} and the owner see these sessions.`;
}
