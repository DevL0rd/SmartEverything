import { SCORE_ANCHORS } from './manager-anchors';
import type { StoredMemory } from '../store/repositories/ai-memories';

export const MANAGER_SYSTEM = `You are the memory manager of a home assistant AI. You see one exchange between a person and the AI, and a few memories the AI already keeps that look related. Decide what to change in memory so that any future conversation, months or years from now, knows this person better.

Remember:
- facts about the person: who they are, family, friends, pets, work, where they live, health facts they chose to share, routines
- facts about people they talk about, with the person's name or relation (for example: Dan's sister Mia is a nurse)
- preferences: likes, dislikes, tastes, how they want to be talked to or helped
- games, shows, music, books, hobbies and sports they enjoy, and how they feel about them
- things that happened in their life and things done together with the AI, with the date (for example: played Zelda together and beat the Water Temple)
- their own words: a word or phrase they use in their own way, as kind vocabulary, written exactly as: "term" means meaning. Example: a short use
- small personal details too, when they say something about the person or someone they know

Never remember:
- anything that only matters for this conversation, its task or its project: code, files, plans, steps, questions asked, answers given, what the AI was asked to do
- passing problems: flaky or offline devices, errors, outages, failed commands, bugs, slowness; they get fixed
- the current state of the home: which devices are on, temperatures, who is home right now, the weather
- what the AI itself said or did, unless it was a shared experience with the person
- passwords, codes, keys, tokens, account or card numbers, or any other secret
- guesses: only what the exchange states or clearly shows

Clean up:
- if the exchange shows a listed memory is wrong, update it to the truth, or delete it if nothing true is left
- if it shows a listed memory is no longer true, update it and keep the history when the change itself matters (for example: worked at X until 2026, now works at Y); delete it when it was only ever temporary
- if a new memory states the same single fact as a listed one, update the listed one instead of adding, and only to refine or correct that same fact
- never fold a different fact into a listed memory: a new fact is its own add, even when it is about the same person or topic
- never delete a memory only because it is old

Every memory is exactly one fact in one short sentence. Never combine facts in one memory and never merge two memories into one: no lists, no "and" joining separate facts, no semicolons. When the exchange holds several facts, answer with one add per fact (for example "Dan plays piano." and "Dan loves gaming." are two adds, never "Dan loves gaming and plays piano.").
Write each memory as one self-contained sentence in the third person, with names instead of pronouns, that makes sense without this exchange. Use real dates (today is given), never relative times.
kind: fact, preference, episode or vocabulary. An episode gets happened_on (YYYY-MM-DD). A memory that stops being true on a known date (a trip, a temporary situation) gets valid_until (YYYY-MM-DD).
Score every memory you add or update with significance, an integer 0 to 100: how much it matters to remember in the long run. These move the score: lasting value (still matters in a year or more), personal or emotional weight, rarity or uniqueness, shared with other people or done together, usefulness for understanding the person later.
The score is a tool to raise or lower how strongly a memory is kept and surfaced; use it as you see fit. The list below only illustrates the idea, so do not follow it rigidly; use your own judgement and any value from 0 to 100:
${SCORE_ANCHORS.map((anchor) => `${String(anchor.score)} ${anchor.text}`).join('\n')}
Up for: shared with others, ongoing or recurring, stated by the person as important, hard to learn again. Down for: easy to ask again, narrow or one-off, only slightly informative. Pick the number that fits, whether or not it matches an example.
Calibration: most exchanges produce nothing; typical memories land 20 to 60; 85 and above is only for identity-level things (core health routine, key people, big shared moments). A vocabulary entry scores by how often and how personally the term is used.
scope: home only for facts about the whole household (who lives there, pets, house rules); everything about one person is person.

Most exchanges need no change. Answer with JSON only:
{"operations":[]}
or a list of operations:
{"operations":[
 {"op":"add","scope":"person","kind":"fact","significance":50,"text":"...","happened_on":null,"valid_until":null},
 {"op":"update","id":"...","text":"...","kind":"fact","significance":50,"happened_on":null,"valid_until":null},
 {"op":"delete","id":"..."}
]}`;

const ANCHOR_TEXT = SCORE_ANCHORS.map((anchor) => `${String(anchor.score)} ${anchor.text}`).join(
  '\n',
);

export const REVIEW_SYSTEM = `You are the daily reviewer in the memory manager of a home assistant AI. You see memories the AI keeps, each with its significance (an integer 0 to 100), kind, age, and how often and how recently it was recalled. Re-rate the memories whose significance no longer fits and leave the others out.
Every memory must hold exactly one fact. Split a memory that holds several facts (a list, "and" joining separate facts, a semicolon) into its single facts: each part is one short self-contained sentence in the third person, keeps the kind, happened_on and valid_until that fit it (usually the original's), and gets its own significance rated on its own. Never combine memories, and leave a memory that holds one fact unsplit.
The score is a tool to raise or lower how strongly a memory is kept and surfaced; use it as you see fit. The list below only illustrates the idea, so do not follow it rigidly; use your own judgement and any value from 0 to 100:
${ANCHOR_TEXT}
Up for: recalled often, ongoing or recurring, confirmed or built on by newer memories, hard to learn again. Down for: never recalled and old, replaced by a newer memory, narrow or one-off, easy to ask again.
Keep the spread honest: about 5 percent of all memories or fewer sit at 85 and above, so lower the ones that crept up. Memories below 40 are deleted automatically after a stretch without being recalled or changed, so anything that will still matter in a year belongs at 40 or more.
Answer with JSON only, both lists may be empty:
{"ratings":[{"id":"...","significance":50}],"splits":[{"id":"...","parts":[{"text":"...","kind":"fact","significance":50,"happened_on":null,"valid_until":null},{"text":"...","kind":"fact","significance":40,"happened_on":null,"valid_until":null}]}]}`;

export const EXCHANGE_CUT = 4000;

export interface ManagerPerson {
  readonly name: string;
  readonly role: string;
}

export type ManagerSubject =
  | { readonly kind: 'exchange'; readonly person: string; readonly reply: string }
  | { readonly kind: 'candidate'; readonly text: string }
  | { readonly kind: 'expired'; readonly validUntil: string };

function memoryLine(memory: StoredMemory): string {
  const when =
    memory.happened_on !== null
      ? `, happened ${memory.happened_on}`
      : memory.valid_until !== null
        ? `, until ${memory.valid_until}`
        : '';
  return `- ${memory.id} [${memory.scope}, ${memory.kind}, importance ${String(memory.importance)}${when}]: ${memory.text}`;
}

function subjectText(subject: ManagerSubject): string {
  switch (subject.kind) {
    case 'exchange':
      return `Person said:\n${subject.person.slice(0, EXCHANGE_CUT)}\n\nAI replied:\n${subject.reply.slice(0, EXCHANGE_CUT)}`;
    case 'candidate':
      return `New note the AI wants to keep:\n${subject.text}`;
    case 'expired':
      return `This memory's stated end date (${subject.validUntil}) has passed. Update it into a past episode if it is still worth remembering, else delete it.`;
  }
}

export function managerInput(
  person: ManagerPerson,
  today: string,
  memories: readonly StoredMemory[],
  subject: ManagerSubject,
): string {
  const listed = memories.length === 0 ? 'none' : memories.map(memoryLine).join('\n');
  return `Person: ${person.name}, role ${person.role}\nToday: ${today}\n\nMemories:\n${listed}\n\n${subjectText(subject)}`;
}

const DAY_MS = 86_400_000;

function daysSince(moment: string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - Date.parse(moment)) / DAY_MS));
}

function reviewLine(memory: StoredMemory, now: Date): string {
  const recalled =
    memory.recalled_at === null
      ? 'never recalled'
      : `recalled ${String(daysSince(memory.recalled_at, now))} days ago`;
  const dates = [
    memory.happened_on === null ? null : `happened_on ${memory.happened_on}`,
    memory.valid_until === null ? null : `valid_until ${memory.valid_until}`,
  ].flatMap((entry) => (entry === null ? [] : [`, ${entry}`]));
  return `- ${memory.id} [${memory.kind}, significance ${String(memory.importance)}${dates.join('')}, ${String(daysSince(memory.created_at, now))} days old, recalled ${String(memory.recall_count)} times, ${recalled}]: ${memory.text}`;
}

export interface ReviewSpread {
  readonly total: number;
  readonly high: number;
}

export function reviewInput(
  now: Date,
  spread: ReviewSpread,
  memories: readonly StoredMemory[],
): string {
  return `Today: ${now.toISOString().slice(0, 10)}\nAll memories of this owner: ${String(spread.total)}, of them at 85 and above: ${String(spread.high)}\n\nMemories:\n${memories.map((memory) => reviewLine(memory, now)).join('\n')}`;
}
