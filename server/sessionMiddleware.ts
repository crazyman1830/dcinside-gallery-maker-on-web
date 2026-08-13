import type { NextFunction, Request, Response } from 'express';
import {
  SESSION_TTL_MS,
  sessionCredentialStore,
  type SessionCredentialStore,
} from './sessionStore';

export const SESSION_COOKIE = 'dcgm_session';

const parseCookie = (header: string | undefined, name: string): string | undefined => {
  if (!header) return undefined;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const createSessionMiddleware = (
  store: SessionCredentialStore = sessionCredentialStore,
) => (request: Request, response: Response, next: NextFunction): void => {
  const requestedId = parseCookie(request.headers.cookie, SESSION_COOKIE);
  const session = store.getOrCreate(requestedId);
  response.locals.sessionId = session.id;
  response.cookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
  next();
};

export const getSessionId = (request: Request): string => {
  const sessionId = request.res?.locals.sessionId;
  if (typeof sessionId !== 'string') throw new Error('로컬 세션을 확인할 수 없습니다.');
  return sessionId;
};
