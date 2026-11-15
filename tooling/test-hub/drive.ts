import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { daysAgo } from './clock.ts';
import type { Counted, FilesContext } from './context.ts';
import { layoutOf } from './layout.ts';
import { noise, textPdf, wavTone, writeFileAt, writePng } from './media.ts';
import type { Random } from './random.ts';

const execute = promisify(execFile);

const NOTES = [
  'Meeting notes',
  'Project ideas',
  'Reading list',
  'Travel checklist',
  'Garden plan',
  'Gift ideas',
  'Weekly review',
  'Renovation to-do',
  'Meal plan',
  'Workout log',
];

const RECIPES = [
  'Shakshuka',
  'Lentil soup',
  'Roast chicken',
  'Pad thai',
  'Banana bread',
  'Chickpea curry',
  'Margherita pizza',
  'Pancakes',
];

const MANUALS = ['Washing machine', 'Dishwasher', 'Router', 'Heating controller', 'Smart lock'];

function noteBody(title: string, index: number): string {
  return `# ${title}\n\nSynthetic test note ${String(index + 1)}.\n\n- first point\n- second point\n- third point\n\nThis file exists only to populate the test Hub.\n`;
}

function csv(rows: number, headers: readonly string[], index: number): string {
  const lines = [headers.join(',')];
  for (let row = 0; row < rows; row += 1)
    lines.push(headers.map((_, column) => String((row + 1) * (column + 3) + index)).join(','));
  return `${lines.join('\n')}\n`;
}

interface Writer {
  readonly drive: string;
  readonly write: (path: string, data: Uint8Array | string, days: number) => Promise<void>;
  readonly rng: Random;
  readonly context: FilesContext;
}

function writerOf(context: FilesContext, drive: string, label: string): Writer {
  const rng = context.rng(label);
  return {
    drive,
    rng,
    context,
    write: (path, data, days) =>
      writeFileAt(
        join(drive, path),
        data,
        daysAgo(context.anchor, days, rng.int(8, 20), rng.int(0, 59)),
      ),
  };
}

async function documents(writer: Writer): Promise<number> {
  const { write, rng } = writer;
  let count = 0;
  for (const [index, title] of NOTES.entries()) {
    await write(`Documents/Notes/${title}.md`, noteBody(title, index), rng.int(1, 600));
    count += 1;
  }
  for (const [index, name] of ['Budget 2025', 'Budget 2026', 'Expenses', 'Investments'].entries()) {
    const columns = ['date', 'category', 'amount', 'balance'];
    await write(
      `Documents/Finance/${name}.csv`,
      csv(40 + index * 20, columns, index),
      rng.int(5, 500),
    );
    count += 1;
  }
  for (const [index, name] of [
    'Landlord letter',
    'Insurance claim',
    'Cover letter',
    'Complaint',
  ].entries()) {
    const body = `Dear Sir or Madam,\n\nSynthetic letter ${String(index + 1)} for the test Hub.\n\nKind regards\n`;
    await write(`Documents/Letters/${name}.txt`, body, rng.int(10, 700));
    count += 1;
  }
  for (const [index, name] of [
    'Tenancy agreement',
    'Passport scan notes',
    'Warranty card',
    'Tax summary',
  ].entries()) {
    const pdf = textPdf(name, [
      `Synthetic document ${String(index + 1)}`,
      'Generated for the test Hub.',
    ]);
    await write(`Documents/Important/${name}.pdf`, pdf, rng.int(20, 700));
    count += 1;
  }
  return count;
}

async function projects(writer: Writer): Promise<number> {
  const { write, rng } = writer;
  const sites = ['index.html', 'style.css', 'app.js', 'package.json', 'README.md'];
  for (const [index, name] of sites.entries())
    await write(
      `Projects/website/${name}`,
      `/* synthetic ${name} ${String(index)} */\n`.repeat(30),
      rng.int(2, 200),
    );
  const scripts = ['backup.sh', 'rotate-logs.sh', 'sync.sh'];
  for (const name of scripts)
    await write(
      `Projects/scripts/${name}`,
      `#!/bin/sh\necho "synthetic ${name}"\n`,
      rng.int(2, 300),
    );
  return sites.length + scripts.length;
}

async function media(writer: Writer): Promise<number> {
  const { write, rng, drive, context } = writer;
  for (const [index, hue] of [20, 120, 200, 280, 330].entries()) {
    const at = daysAgo(context.anchor, rng.int(20, 500), rng.int(8, 20));
    await writePng(
      join(drive, `Pictures/Wallpapers/wallpaper-${String(index + 1)}.png`),
      { takenAt: at, place: null, make: 'x', model: 'x', width: 1280, height: 720, hue },
      `Wallpaper ${String(index + 1)}`,
      at,
    );
  }
  const tones = [262, 330, 392, 440];
  for (const [index, frequency] of tones.entries())
    await write(`Music/Tone ${String(index + 1)}.wav`, wavTone(3, frequency), rng.int(30, 700));
  await write('Large/dataset-small.bin', noise(rng, 3 << 20), 40);
  await write('Large/dataset-large.bin', noise(rng, 7 << 20), 90);
  await write('Large/disk-image.bin', noise(rng, 12 << 20), 200);
  return 5 + tones.length + 3;
}

async function extras(writer: Writer): Promise<number> {
  const { write, rng, drive } = writer;
  await write('Notes to self.txt', 'Remember to test the test Hub.\n', 1);
  await mkdir(join(drive, 'Documents/Notes'), { recursive: true });
  await copyFile(
    join(drive, 'Documents/Notes/Meeting notes.md'),
    join(drive, 'Documents/Notes/Meeting notes (copy).md'),
  );
  const staging = join(drive, '.seed-archive');
  await write('.seed-archive/readme.txt', 'Inside the archive.\n', 30);
  await write('.seed-archive/data.csv', csv(30, ['a', 'b', 'c'], rng.int(1, 9)), 30);
  await mkdir(join(drive, 'Archives'), { recursive: true });
  await execute('zip', [
    '-q',
    '-j',
    join(drive, 'Archives/backup-2025.zip'),
    join(staging, 'readme.txt'),
    join(staging, 'data.csv'),
  ]);
  await rm(staging, { recursive: true, force: true });
  return 3;
}

async function ownerFiles(context: FilesContext, drive: string): Promise<number> {
  const writer = writerOf(context, drive, 'drive-owner');
  return (
    (await documents(writer)) +
    (await projects(writer)) +
    (await media(writer)) +
    (await extras(writer))
  );
}

async function homeFiles(context: FilesContext, drive: string): Promise<number> {
  const rng = context.rng('drive-home');
  let count = 0;
  const write = async (path: string, data: Uint8Array | string, days: number): Promise<void> => {
    await writeFileAt(join(drive, path), data, daysAgo(context.anchor, days, rng.int(8, 20)));
    count += 1;
  };
  await write(
    'Household/Shared budget.csv',
    csv(60, ['month', 'category', 'planned', 'actual'], 3),
    12,
  );
  await write(
    'Household/Chore rota.md',
    '# Chore rota\n\n- Monday: bins\n- Wednesday: laundry\n- Saturday: deep clean\n',
    25,
  );
  await write(
    'Household/WiFi card.txt',
    'Network: test-network\nThis is synthetic and not a real credential.\n',
    90,
  );
  await write(
    'Household/Emergency contacts.md',
    '# Emergency contacts\n\nSynthetic numbers only.\n',
    60,
  );
  for (const [index, name] of RECIPES.entries())
    await write(
      `Recipes/${name}.md`,
      `# ${name}\n\nSynthetic recipe ${String(index + 1)}.\n\n1. Prepare\n2. Cook\n3. Serve\n`,
      rng.int(5, 400),
    );
  for (const name of MANUALS)
    await write(
      `Manuals/${name} manual.pdf`,
      textPdf(`${name} manual`, ['Synthetic manual page.']),
      rng.int(100, 700),
    );
  await write(
    'Manuals/Appliance warranty list.csv',
    csv(12, ['appliance', 'bought', 'warranty_months'], 5),
    300,
  );
  return count;
}

async function memberFiles(context: FilesContext, drive: string, index: number): Promise<number> {
  const rng = context.rng(`drive-member-${String(index)}`);
  let count = 0;
  for (const name of ['Plans', 'Study notes', 'Ideas', 'Reading']) {
    await writeFileAt(
      join(drive, `Documents/${name}.md`),
      noteBody(name, index),
      daysAgo(context.anchor, rng.int(3, 300), rng.int(8, 20)),
    );
    count += 1;
  }
  await writeFileAt(
    join(drive, 'Finance/Savings.csv'),
    csv(24, ['month', 'saved'], index),
    daysAgo(context.anchor, 20),
  );
  return count + 1;
}

export async function writeDriveFiles(context: FilesContext): Promise<Counted> {
  const layout = layoutOf(context.paths);
  const counts: Record<string, number> = { home: await homeFiles(context, layout.home.drive) };
  for (const [index, person] of context.people.entries()) {
    const drive = layout.person(person.id).drive;
    counts[`person${String(index + 1)}`] =
      index === 0 ? await ownerFiles(context, drive) : await memberFiles(context, drive, index);
  }
  return counts;
}
