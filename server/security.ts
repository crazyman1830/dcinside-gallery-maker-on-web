import type { NextFunction, Request, Response } from 'express';

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

export const isLoopbackHost = (host: string | undefined): boolean =>
  typeof host === 'string' && LOOPBACK_HOST.test(host);

export const loopbackRequestGuard = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  if (!isLoopbackHost(request.headers.host)) {
    response.status(403).json({ error: '로컬 호스트 요청만 허용됩니다.' });
    return;
  }
  const fetchSite = request.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    response.status(403).json({ error: '교차 사이트 로컬 요청은 허용되지 않습니다.' });
    return;
  }
  const origin = request.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      const requestHost = request.headers.host?.toLowerCase();
      if (
        parsed.protocol !== 'http:' ||
        !isLoopbackHost(parsed.host) ||
        parsed.host.toLowerCase() !== requestHost
      ) {
        response.status(403).json({ error: '로컬 출처 요청만 허용됩니다.' });
        return;
      }
    } catch {
      response.status(403).json({ error: '요청 출처가 올바르지 않습니다.' });
      return;
    }
  }
  next();
};

export const createSecurityHeaders =
  (development = false) =>
  (_request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data:",
        `connect-src 'self'${development ? ' ws:' : ''}`,
      ].join('; '),
    );
    next();
  };

export const securityHeaders = createSecurityHeaders();

const SENSITIVE_PATH = /^\/(?:vertex|credentials|secrets)(?:\/|$)/i;

export const sensitivePathGuard = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  if (SENSITIVE_PATH.test(request.path)) {
    response.status(404).json({ error: '경로를 찾을 수 없습니다.' });
    return;
  }
  next();
};
