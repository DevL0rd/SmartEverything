import type { LinkLaunch } from './link-launch';

export const MOD_FILE = 'register.js';

const MOD_BODY = `
const resultBody = (id, request, failure) => ({
  kind: 'result',
  session_id: id,
  request_id: request,
  ok: failure === null,
  ...(failure === null ? {} : { error: failure }),
});

const usageBody = (id, usage) => ({
  kind: 'usage',
  session_id: id,
  windows: usage.rateLimits.map((limit) => ({ key: limit.kind, used_percent: limit.percentUsed })),
});

const takeLines = (buffer) => {
  const parts = buffer.split('\\n');
  const rest = parts.pop();
  return { lines: parts.filter((line) => line.trim() !== ''), rest };
};

export const register = (on) => {
  const state = { id: null, turn: null };
  on('turn.start', ($, e, next) => {
    state.turn = e.turnId;
    return next(e);
  });
  on('turn.complete', async ($, e, next) => {
    state.turn = null;
    if (state.id !== null) {
      const usage = await $.session.usage();
      await $.process.run(argv('report', []), { env: ENVIRONMENT, stdin: JSON.stringify(usageBody(state.id, usage)) });
    }
    return next(e);
  });
  on('session.start', async ($, e, next) => {
    state.id = await $.session.id();
    const started = await next(e);
    const stream = $.process.spawn({ argv: argv('stream', ['--session', state.id]), env: ENVIRONMENT });
    void (async () => {
      let buffer = '';
      for await (const chunk of stream) {
        if (chunk.stream !== 'stdout') {
          continue;
        }
        const taken = takeLines(buffer + chunk.text);
        buffer = taken.rest;
        for (const line of taken.lines) {
          void (async (request) => {
            let failure = null;
            try {
              if (request.op === 'send') {
                await $.prompt.submit({ text: request.text });
              } else if (request.op === 'interrupt' && state.turn === null) {
                failure = 'no turn is running';
              } else if (request.op === 'interrupt') {
                await $.turn.abort({ turnId: state.turn });
              } else if (request.op === 'usage') {
                const usage = await $.session.usage();
                await $.process.run(argv('report', []), { env: ENVIRONMENT, stdin: JSON.stringify(usageBody(state.id, usage)) });
              }
            } catch (cause) {
              failure = String(cause);
            }
            await $.process.run(argv('report', []), { env: ENVIRONMENT, stdin: JSON.stringify(resultBody(state.id, request.id, failure)) });
          })(JSON.parse(line));
        }
      }
    })();
    return started;
  });
};
`;

export function modSource(launch: LinkLaunch): string {
  const head = [
    `const COMMAND = ${JSON.stringify(launch.command)};`,
    `const SCRIPT = ${JSON.stringify(launch.script)};`,
    `const DATA = ${JSON.stringify(launch.dataDirectory)};`,
    `const ENVIRONMENT = { ELECTRON_RUN_AS_NODE: '1' };`,
    `const argv = (subcommand, extra) => [COMMAND, SCRIPT, subcommand, '--data', DATA].concat(extra);`,
  ];
  return `${head.join('\n')}\n${MOD_BODY}`;
}
