import type { LinkLaunch } from './link-launch';

export const MOD_FILE = 'register.js';

const MOD_BODY = `
const resultBody = (id, request, failure, value) => ({
  kind: 'result',
  session_id: id,
  request_id: request,
  ok: failure === null,
  ...(value === undefined ? {} : { value }),
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
  const state = { id: null, turn: null, generation: 0 };
  on('session.end', ($, e, next) => {
    state.turn = null;
    if (e.reason === 'clear' || e.reason === 'resume') return next(e);
    state.generation += 1;
    state.id = null;
    return next(e);
  });
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
    const generation = ++state.generation;
    void (async () => {
      while (generation === state.generation) {
        const session = await $.session.id();
        state.id = session;
        let output;
        try {
          output = await $.process.run(argv('poll', ['--session', session]), { env: ENVIRONMENT, timeoutMs: 30000 });
          if (output.exitCode !== 0) throw new Error(output.stderr || 'The native link poll failed.');
        } catch {
          if (generation === state.generation) await $.clock.sleep(1000);
          continue;
        }
        if (generation !== state.generation) break;
        const taken = takeLines(output.stdout);
        for (const line of taken.lines) {
          void (async (request) => {
            let failure = null;
            let value;
            try {
              if (await $.session.id() !== session) throw new Error('The native session changed before this action was delivered; it was not submitted.');
              if (request.op === 'send') {
                await $.prompt.submit({ text: request.text });
              } else if (request.op === 'interrupt' && state.turn === null) {
                failure = 'no turn is running';
              } else if (request.op === 'interrupt') {
                await $.turn.abort({ turnId: state.turn });
              } else if (request.op === 'tools') {
                value = { root: $.plugin.root, tools: await $.tool.list() };
              } else if (request.op === 'tool') {
                const offered = await $.tool.list();
                if (!offered.some((tool) => tool.name === request.name)) { throw new Error('The native tool is not attached.'); }
                const output = await $.tool.call({ ...request.arguments, tool: request.name });
                if (output.deny !== undefined || output.isError === true) { throw new Error(output.deny || output.text || 'The native tool failed.'); }
                value = output;
              } else if (request.op === 'usage') {
                const usage = await $.session.usage();
                await $.process.run(argv('report', []), { env: ENVIRONMENT, stdin: JSON.stringify(usageBody(state.id, usage)) });
              } else {
                failure = 'The native link action is not supported.';
              }
            } catch (cause) {
              failure = String(cause);
            }
            await $.process.run(argv('report', []), { env: ENVIRONMENT, stdin: JSON.stringify(resultBody(session, request.id, failure, value)) });
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
