import { spawnSync } from 'node:child_process';
import { capturedText, releaseCommandEnvironment } from './release-process.ts';
import { STEPS_REQUEST } from './self-update-steps.ts';

function main(): void {
  const request = STEPS_REQUEST.parse(JSON.parse(process.argv[2] ?? '{}'));
  const environment = releaseCommandEnvironment(request.environment);
  for (const step of request.steps) {
    process.stderr.write(`${request.tag}: ${step.name}\n`);
    const result = spawnSync(step.program, [...step.args], {
      cwd: step.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: environment,
    });
    process.stdout.write(capturedText(result.stdout));
    process.stderr.write(capturedText(result.stderr));
    if (result.status !== 0) {
      throw new Error(`${step.name} failed with exit status ${String(result.status)}`);
    }
  }
}

main();
