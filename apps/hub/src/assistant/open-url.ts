import { ProgramError, runFile, type Runner } from './run';

const MAC_SCHEME_HANDLER =
  "function run([scheme]) { ObjC.import('AppKit'); const app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString(scheme + ':')); return app.isNil() ? '' : app.path.js; }";

export async function openUrl(url: string, run: Runner = runFile): Promise<void> {
  if (process.platform === 'win32') {
    await run('rundll32', ['url.dll,FileProtocolHandler', url]);
  } else if (process.platform === 'darwin') {
    await run('open', [url]);
  } else {
    await run('xdg-open', [url]);
  }
}

async function handlerText(scheme: string, run: Runner): Promise<string> {
  try {
    const result =
      process.platform === 'darwin'
        ? await run('osascript', ['-l', 'JavaScript', '-e', MAC_SCHEME_HANDLER, scheme], {
            timeoutMs: 5000,
          })
        : await run('xdg-mime', ['query', 'default', `x-scheme-handler/${scheme}`]);
    return result.stdout.trim();
  } catch (cause) {
    if (!(cause instanceof ProgramError)) {
      throw cause;
    }
    return '';
  }
}

export async function handlesScheme(scheme: string, run: Runner = runFile): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      await run('reg', ['query', `HKCR\\${scheme}`, '/v', 'URL Protocol']);
      return true;
    } catch (cause) {
      if (!(cause instanceof ProgramError)) {
        throw cause;
      }
      return false;
    }
  }
  return (await handlerText(scheme, run)) !== '';
}
