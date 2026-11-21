import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyPrompt, type Risk } from '../../src/claude/prompt-risk';

let root = '';
let outside = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'risk-'));
  outside = mkdtempSync(join(tmpdir(), 'risk-out-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'main.ts'), 'x');
  writeFileSync(join(outside, 'private.txt'), 'x');
  symlinkSync(outside, join(root, 'escape'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function bash(command: string, cwd: string | null = root): Promise<Risk> {
  return classifyPrompt({ toolName: 'Bash', input: { command }, cwd });
}

function tool(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string | null = root,
): Promise<Risk> {
  return classifyPrompt({ toolName, input, cwd });
}

describe('classifyPrompt for shell commands', () => {
  it('calls read-only commands inside the session folder safe', async () => {
    for (const command of [
      'ls -la src',
      'cat src/main.ts',
      'git log --oneline -5',
      'git status',
      'git diff HEAD~1..HEAD',
      'ls src | wc -l',
      'grep -rn "needle" src',
      'pwd && whoami',
    ]) {
      expect(await bash(command), command).toEqual({ risk: 'safe', reasons: [] });
    }
  });

  it('calls a command that is not on the read-only list risky and names it', async () => {
    expect(await bash('rm -rf src')).toEqual({
      risk: 'risky',
      reasons: ['rm is not on the read-only list'],
    });
    expect((await bash('curl https://example.test')).reasons).toEqual([
      'curl is not on the read-only list',
    ]);
  });

  it('judges every command of a pipeline or chain and reports each reason once', async () => {
    expect((await bash('ls src && rm x || rm y; cat src/main.ts')).reasons).toEqual([
      'rm is not on the read-only list',
    ]);
  });

  it('refuses redirection, substitution, grouping and background execution', async () => {
    for (const command of [
      'echo hi > src/main.ts',
      'cat $(echo src/main.ts)',
      'ls `pwd`',
      'ls src &',
      '(ls)',
      'echo "$HOME"',
    ]) {
      expect(await bash(command), command).toEqual({
        risk: 'risky',
        reasons: ['uses redirection, substitution, grouping or background execution'],
      });
    }
  });

  it('refuses an unclosed quote and an empty command', async () => {
    expect((await bash('echo "open')).reasons).toEqual(['has an unclosed quote']);
    expect((await bash('   ')).reasons).toEqual(['has no command']);
    expect((await tool('Bash', {})).reasons).toEqual(['has no command']);
  });

  it('refuses options that are not on the read-only list of the program', async () => {
    expect((await bash('ls --delete')).reasons).toEqual([
      'ls --delete is not a known read-only option',
    ]);
    expect((await bash('git branch -D feature')).reasons).toEqual([
      'git branch -D is not a known read-only option',
      'git branch takes arguments here that are not on the read-only list',
    ]);
    expect((await bash('git push origin main')).reasons).toEqual([
      'git push is not on the read-only list',
    ]);
  });

  it('keeps quoted text out of the path check for text-only programs', async () => {
    expect(await bash('echo "../../etc/passwd"')).toEqual({ risk: 'safe', reasons: [] });
  });

  it('refuses paths that leave the session folder', async () => {
    expect((await bash('cat ../outside.txt')).reasons).toEqual([
      'leaves the session folder (../outside.txt)',
    ]);
    expect((await bash('cat ~/notes.txt')).reasons).toEqual([
      'leaves the session folder (~/notes.txt)',
    ]);
    expect((await bash(`cat ${outside}/private.txt`)).reasons).toEqual([
      `names a path outside the session folder or one that cannot be resolved (${outside}/private.txt)`,
    ]);
  });

  it('follows a symlink to its real target before deciding', async () => {
    expect((await bash('cat escape/private.txt')).reasons).toEqual([
      'names a path outside the session folder or one that cannot be resolved (escape/private.txt)',
    ]);
  });

  it('refuses secret locations even inside the session folder', async () => {
    expect((await bash('cat .env')).reasons).toEqual(['touches a secrets path (.env)']);
    expect((await bash('cat .ssh/id_ed25519')).reasons).toEqual([
      'touches a secrets path (.ssh/id_ed25519)',
    ]);
    expect((await bash('cat deploy/server.pem')).reasons).toEqual([
      'touches a secrets path (deploy/server.pem)',
    ]);
  });

  it('accepts git revision ranges as references, not paths', async () => {
    expect(await bash('git log main..feature')).toEqual({ risk: 'safe', reasons: [] });
  });

  it('cannot judge paths without a usable session folder', async () => {
    expect((await bash('cat src/main.ts', null)).reasons).toEqual([
      'the session folder is unknown for src/main.ts',
    ]);
    expect((await bash('cat src/main.ts', '/')).reasons).toEqual([
      'the session folder is unknown for src/main.ts',
    ]);
    expect((await bash('cat src/main.ts', 'relative/dir')).reasons).toEqual([
      'the session folder is unknown for src/main.ts',
    ]);
    expect(await bash('pwd', null)).toEqual({ risk: 'safe', reasons: [] });
  });
});

describe('classifyPrompt for file tools', () => {
  it('lets the read tools read inside the session folder', async () => {
    expect(await tool('Read', { file_path: join(root, 'src', 'main.ts') })).toEqual({
      risk: 'safe',
      reasons: [],
    });
    expect((await tool('Grep', { path: 'src' })).risk).toBe('safe');
  });

  it('refuses reads outside the folder and of secrets', async () => {
    expect((await tool('Read', { file_path: `${outside}/private.txt` })).reasons).toEqual([
      `reads outside the session folder or a path that cannot be resolved (${outside}/private.txt)`,
    ]);
    expect((await tool('Read', { file_path: join(root, '.env.local') })).reasons).toEqual([
      `touches a secrets path (${join(root, '.env.local')})`,
    ]);
  });

  it('lets the write tools write ordinary files and refuses hook and shell-profile files', async () => {
    expect((await tool('Write', { file_path: join(root, 'src', 'new.ts') })).risk).toBe('safe');
    expect(
      (await tool('Edit', { file_path: join(root, '.git', 'hooks', 'pre-commit') })).reasons,
    ).toEqual([
      `writes a configuration or hook file (${join(root, '.git', 'hooks', 'pre-commit')})`,
    ]);
    expect((await tool('Write', { file_path: join(root, '.bashrc') })).risk).toBe('risky');
  });

  it('refuses a write that names no file', async () => {
    expect(await tool('Write', {})).toEqual({ risk: 'risky', reasons: ['names no file to write'] });
  });

  it('refuses a file path when the session folder is unknown', async () => {
    expect((await tool('Read', { file_path: '/etc/hostname' }, null)).reasons).toEqual([
      'the session folder is unknown or too broad to judge the path',
    ]);
  });
});

describe('classifyPrompt for other tools', () => {
  it('answers questions and task bookkeeping without risk', async () => {
    expect((await tool('AskUserQuestion', {}, null)).risk).toBe('safe');
    expect((await tool('TodoWrite', {}, null)).risk).toBe('safe');
    expect((await tool('TaskList', {}, null)).risk).toBe('safe');
  });

  it('flags plan approval, MCP tools, network tools and unknown tools', async () => {
    expect((await tool('ExitPlanMode', {})).reasons).toEqual([
      'approving the plan lets the session start changing things',
    ]);
    expect((await tool('mcp__other__go', {})).reasons).toEqual([
      'runs a tool of another MCP server (mcp__other__go)',
    ]);
    expect((await tool('WebFetch', {})).reasons).toEqual(['reaches the network (WebFetch)']);
    expect((await tool('WebSearch', {})).reasons).toEqual(['reaches the network (WebSearch)']);
    expect((await tool('Mystery', {})).reasons).toEqual(['Mystery is not a tool this check knows']);
  });

  it('does not treat object prototype names as known tools', async () => {
    expect((await tool('constructor', {})).reasons).toEqual([
      'constructor is not a tool this check knows',
    ]);
    expect((await bash('constructor')).reasons).toEqual([
      'constructor is not on the read-only list',
    ]);
  });
});
