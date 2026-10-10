import type { ProviderPrompt } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  ACCOUNT_BASE,
  XIAOMI_SID,
  XiaomiLoginError,
  identityListUrl,
  parseIdentityList,
  parseLoginAuth,
  parseLoginJson,
  parseSendTicket,
  parseServiceLogin,
  parseVerifyTicket,
  passwordHash,
  verificationDestination,
  verificationFlag,
  type LoginAuthReply,
  type LoginSession,
  type LoginSign,
  type VerificationMethod,
} from '@smarteverything/xiaomi';
import { ProviderProblemError } from '../contract';
import type { SessionTokens } from './account';
import type { AccountHttp } from './account-http';

const SERVICE_LOGIN = `${ACCOUNT_BASE}/pass/serviceLogin?sid=${XIAOMI_SID}&_json=true`;
const LOGIN_AUTH = `${ACCOUNT_BASE}/pass/serviceLoginAuth2?_json=true`;
const CAPTCHA_ATTEMPTS = 3;

export interface LoginIo {
  readonly http: AccountHttp;
  readonly ask: (prompt: ProviderPrompt) => Promise<string>;
  readonly log: Logger;
}

export interface PasswordCredentials {
  readonly username: string;
  readonly password: string;
}

async function finishSession(http: AccountHttp, session: LoginSession): Promise<SessionTokens> {
  await http.follow(session.location);
  const serviceToken = http.cookie('serviceToken');
  if (serviceToken === null) {
    throw new XiaomiLoginError('sts', 'a serviceToken cookie', 'none');
  }
  return {
    userId: session.userId,
    passToken: session.passToken,
    ssecurity: session.ssecurity,
    serviceToken,
  };
}

export async function signInWithPassToken(
  http: AccountHttp,
  userId: string,
  passToken: string,
): Promise<SessionTokens | null> {
  http.setCookie('userId', userId);
  http.setCookie('passToken', passToken);
  const reply = parseServiceLogin(
    parseLoginJson('serviceLogin', (await http.get(SERVICE_LOGIN)).text),
  );
  return reply.kind === 'session' ? finishSession(http, reply.session) : null;
}

function credentialsReply(text: string): LoginAuthReply {
  const reply = parseLoginJson('serviceLoginAuth2', text);
  try {
    return parseLoginAuth(reply);
  } catch (cause) {
    if (cause instanceof XiaomiLoginError) {
      throw new ProviderProblemError('bad_credentials', cause);
    }
    throw cause;
  }
}

async function solveCaptcha(io: LoginIo, url: string): Promise<string> {
  const image = await io.http.image(url);
  const encoded = Buffer.from(image.bytes).toString('base64');
  io.log.info('xiaomi_login.captcha_requested');
  const answer = await io.ask({
    kind: 'captcha',
    image: `data:${image.contentType};base64,${encoded}`,
  });
  return answer.trim();
}

function authForm(
  sign: LoginSign,
  credentials: PasswordCredentials,
  captcha: string | null,
): Record<string, string> {
  return {
    _json: 'true',
    hash: passwordHash(credentials.password),
    sid: sign.sid,
    callback: sign.callback,
    _sign: sign._sign,
    qs: sign.qs,
    user: credentials.username,
    ...(captcha === null ? {} : { captCode: captcha }),
  };
}

async function sendTicket(io: LoginIo, method: VerificationMethod): Promise<void> {
  let icode = '';
  for (let attempt = 0; attempt <= CAPTCHA_ATTEMPTS; attempt += 1) {
    const sent = await io.http.post(`${ACCOUNT_BASE}/identity/auth/send${method}Ticket`, {
      _json: 'true',
      icode,
      retry: '0',
    });
    const reply = parseSendTicket(parseLoginJson(`send${method}Ticket`, sent.text));
    if (reply.kind === 'sent') {
      return;
    }
    icode = await solveCaptcha(io, reply.url);
  }
  throw new XiaomiLoginError(
    `send${method}Ticket`,
    `a sent code within ${String(CAPTCHA_ATTEMPTS)} captchas`,
    'more captchas',
  );
}

async function verifyIdentity(io: LoginIo, notificationUrl: string): Promise<SessionTokens> {
  const list = await io.http.get(identityListUrl(notificationUrl));
  const method = parseIdentityList(parseLoginJson('identity/list', list.text));
  const flag = verificationFlag(method);
  const verifyUrl = `${ACCOUNT_BASE}/identity/auth/verify${method}?_flag=${flag}&_json=true`;
  const target = await io.http.get(verifyUrl);
  const destination = verificationDestination(
    parseLoginJson(`verify${method}`, target.text),
    method,
  );
  await sendTicket(io, method);
  io.log.info('xiaomi_login.verification_requested', { method });
  const ticket = (await io.ask({ kind: 'verification_code', destination })).trim();
  const verified = await io.http.post(verifyUrl, {
    _flag: flag,
    ticket,
    trust: 'false',
    _json: 'true',
  });
  await io.http.follow(parseVerifyTicket(parseLoginJson(`verify${method}`, verified.text)));
  const userId = io.http.cookie('userId');
  const passToken = io.http.cookie('passToken');
  if (userId === null || passToken === null) {
    throw new XiaomiLoginError(
      'identity result',
      'userId and passToken cookies',
      'neither or only one',
    );
  }
  const tokens = await signInWithPassToken(io.http, userId, passToken);
  if (tokens === null) {
    throw new XiaomiLoginError(
      'serviceLogin',
      'a session for the verified passToken',
      'a new sign-in request',
    );
  }
  return tokens;
}

export async function signInWithPassword(
  io: LoginIo,
  credentials: PasswordCredentials,
): Promise<SessionTokens> {
  const first = parseServiceLogin(
    parseLoginJson('serviceLogin', (await io.http.get(SERVICE_LOGIN)).text),
  );
  if (first.kind === 'session') {
    return finishSession(io.http, first.session);
  }
  let captcha: string | null = null;
  for (let attempt = 0; attempt <= CAPTCHA_ATTEMPTS; attempt += 1) {
    const posted = await io.http.post(LOGIN_AUTH, authForm(first.sign, credentials, captcha));
    const reply = credentialsReply(posted.text);
    switch (reply.kind) {
      case 'session':
        return finishSession(io.http, reply.session);
      case 'verify':
        return verifyIdentity(io, reply.notificationUrl);
      case 'captcha':
        if (reply.wrongAnswer) {
          io.log.warn('xiaomi_login.captcha_refused');
        }
        captcha = await solveCaptcha(io, reply.url);
    }
  }
  throw new XiaomiLoginError(
    'serviceLoginAuth2',
    `a correct captcha within ${String(CAPTCHA_ATTEMPTS)} attempts`,
    'more captchas',
  );
}
