import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const ROOT = join(import.meta.dirname, '..');
const DOMAIN_MODULE = pathToFileURL(join(ROOT, 'packages', 'domain', 'src', 'index.ts')).href;
const KOTLIN_CONSTANTS = join(
  ROOT,
  'apps',
  'app',
  'modules',
  'health-connect',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'healthconnect',
  'DomainConstants.kt',
);

const NAME = z.string().regex(/^[a-z][a-z0-9_]*$/);

const DOMAIN = z.object({
  HEALTH_BATCH_LIMIT: z.int().positive(),
  OUTREACH_RING_SECONDS: z.int().positive(),
  PUSH_COMMAND_KEY: NAME,
  PUSH_PAYLOAD_KEY: NAME,
  PUSH_COMMANDS: z.array(NAME).min(1),
  WATCH_SPORTS: z.array(NAME).min(1),
  PHONE_SETTINGS_PAGES: z.array(NAME).min(1),
  PHONE_SYSTEM_TOGGLES: z.array(NAME).min(1),
  PHONE_SCREEN_TIMEOUTS: z.array(z.int().positive()).min(1),
});

type DomainValues = z.infer<typeof DOMAIN>;

function constant(name: string): string {
  return name.toUpperCase();
}

function stringList(values: readonly string[]): string {
  return values.map((value) => `    "${value}"`).join(',\n');
}

function render(domain: DomainValues): string {
  const commands = domain.PUSH_COMMANDS.map(
    (command) => `  const val PUSH_COMMAND_${constant(command)} = "${command}"`,
  );
  return [
    'package expo.modules.healthconnect',
    '',
    'object DomainConstants {',
    `  const val HEALTH_BATCH_LIMIT = ${String(domain.HEALTH_BATCH_LIMIT)}`,
    `  const val OUTREACH_RING_SECONDS = ${String(domain.OUTREACH_RING_SECONDS)}`,
    `  const val PUSH_COMMAND_KEY = "${domain.PUSH_COMMAND_KEY}"`,
    `  const val PUSH_PAYLOAD_KEY = "${domain.PUSH_PAYLOAD_KEY}"`,
    ...commands,
    '',
    '  val WATCH_SPORTS: List<String> = listOf(',
    stringList(domain.WATCH_SPORTS),
    '  )',
    '',
    '  val PHONE_SETTINGS_PAGES: List<String> = listOf(',
    stringList(domain.PHONE_SETTINGS_PAGES),
    '  )',
    '',
    '  val PHONE_SYSTEM_TOGGLES: List<String> = listOf(',
    stringList(domain.PHONE_SYSTEM_TOGGLES),
    '  )',
    '',
    `  val PHONE_SCREEN_TIMEOUTS: List<Int> = listOf(${domain.PHONE_SCREEN_TIMEOUTS.map(String).join(', ')})`,
    '}',
    '',
  ].join('\n');
}

writeFileSync(KOTLIN_CONSTANTS, render(DOMAIN.parse(await import(DOMAIN_MODULE))));
