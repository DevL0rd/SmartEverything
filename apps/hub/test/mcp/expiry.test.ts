import type { CommandRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { submitAndWait } from '../../src/extensions/mcp/command-waiter';
import { ChangeFeed } from '../../src/store/feed';
import type { Booted } from '../support/booted';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger } from '../support/logs';
import {
  REDIRECT_URI,
  bootHome,
  type Running,
  approvalCode,
  approvedCode,
  connect,
  consentPage,
  oauthError,
  pkce,
  postForm,
  register,
  rpc,
} from './client';

const COMMAND_ID = '0c000000-0000-4000-8000-000000000001';

function command(status: CommandRow['status']): CommandRow {
  return {
    id: COMMAND_ID,
    device_id: null,
    capability: 'power',
    value: true,
    status,
    source: 'assistant',
    result: null,
    error: null,
    requested_by: null,
    created_at: '2026-10-09T10:00:00.000Z',
    started_at: null,
    finished_at: null,
    expires_at: '2026-10-09T10:02:00.000Z',
  };
}

describe('waiting for a command', () => {
  let feed: ChangeFeed;
  let clock: FakeClock;
  let row: CommandRow;

  beforeEach(() => {
    captureLogs();
    feed = new ChangeFeed(testLogger());
    clock = new FakeClock('2026-10-09T10:00:00.000Z');
    row = command('pending');
  });

  function waiting(): ReturnType<typeof submitAndWait> {
    return submitAndWait({
      feed,
      clock,
      waitMs: 20_000,
      submit: () => [row],
      current: () => row,
    });
  }

  it('settles as soon as the change feed reports the command finished', async () => {
    const outcome = waiting();
    expect(clock.pending()).toStrictEqual(['2026-10-09T10:00:20.000Z']);
    feed.emit({
      type: 'change',
      table: 'commands',
      operation: 'UPDATE',
      record: command('running'),
      oldRecord: row,
    });
    expect(clock.pending()).toHaveLength(1);
    row = command('succeeded');
    feed.emit({
      type: 'change',
      table: 'commands',
      operation: 'UPDATE',
      record: row,
      oldRecord: null,
    });
    expect(await outcome).toStrictEqual({ commands: [row], allFinished: true });
    expect(clock.pending()).toStrictEqual([]);
  });

  it('reports the command as unfinished after twenty seconds', async () => {
    const outcome = waiting();
    clock.advanceTo('2026-10-09T10:00:19.999Z');
    clock.advanceTo('2026-10-09T10:00:20.000Z');
    expect(await outcome).toStrictEqual({ commands: [row], allFinished: false });
  });

  it('does not wait for a command that finished while it was submitted', async () => {
    row = command('failed');
    expect(await waiting()).toStrictEqual({ commands: [row], allFinished: true });
    expect(clock.pending()).toStrictEqual([]);
  });

  it('stops listening when the submission is refused', () => {
    expect(() =>
      submitAndWait({
        feed,
        clock,
        waitMs: 20_000,
        submit: () => {
          throw new Error('refused');
        },
        current: () => row,
      }),
    ).toThrow('refused');
    expect(clock.pending()).toStrictEqual([]);
  });
});

describe('lifetimes of the OAuth artefacts', () => {
  let running: Running;
  let booted: Booted;

  beforeEach(async () => {
    running = await bootHome(true);
    booted = running.booted;
  });

  afterEach(async () => {
    await running.stop();
  });

  it('expires an approval code after ten minutes and a consent page after ten minutes', async () => {
    const { clientId } = await register(booted.base);
    const code = await approvalCode(booted);
    booted.moveClock(5 * 60_000);
    const request = await consentPage(booted.base, clientId, pkce().challenge);
    booted.moveClock(5 * 60_000);
    const late = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: code,
      decision: 'approve',
    });
    expect(late.status).toBe(403);
    expect(await late.text()).toContain('No approval code is waiting');
    const fresh = await approvalCode(booted);
    booted.moveClock(5 * 60_000);
    const gone = await postForm(booted.base, '/oauth/authorize', {
      request,
      approval: fresh,
      decision: 'approve',
    });
    expect(gone.status).toBe(400);
    expect(await gone.text()).toContain('This approval page expired');
  });

  it('expires an authorization code after a minute', async () => {
    const { clientId } = await register(booted.base);
    const { verifier, challenge } = pkce();
    const code = await approvedCode(booted, clientId, challenge);
    booted.moveClock(60_000);
    const response = await postForm(booted.base, '/oauth/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    });
    expect(await oauthError(response)).toStrictEqual({ status: 400, error: 'invalid_grant' });
  });

  it('expires an access token after an hour and a refresh token after thirty days', async () => {
    const { clientId, tokens } = await connect(booted);
    booted.moveClock(60 * 60_000);
    const expired = await rpc(booted.base, tokens.access_token, { method: 'ping' });
    expect(expired.status).toBe(401);
    expect(expired.headers.get('www-authenticate')).toContain('error="invalid_token"');
    booted.moveClock(30 * 24 * 60 * 60_000);
    const refreshed = await postForm(booted.base, '/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    });
    expect(await oauthError(refreshed)).toStrictEqual({ status: 400, error: 'invalid_grant' });
  });

  it('may narrow but never widen the scope of a refresh', async () => {
    const { clientId, tokens } = await connect(booted);
    const widened = await postForm(booted.base, '/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      scope: 'mcp admin',
    });
    expect(await oauthError(widened)).toStrictEqual({ status: 400, error: 'invalid_scope' });
    const narrowed = await postForm(booted.base, '/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      scope: 'mcp',
    });
    expect(narrowed.status).toBe(200);
  });
});
