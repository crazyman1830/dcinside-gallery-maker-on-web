import { DEFAULT_ERROR_MESSAGE } from '../constants';
import { UserProfile } from '../types';

export const getFormattedErrorMessage = (
  error: unknown,
  contextMessage?: string,
  defaultMessage: string = DEFAULT_ERROR_MESSAGE,
): string => {
  const baseErrorMessage = error instanceof Error ? error.message : defaultMessage;
  if (contextMessage) {
    return `${contextMessage}: ${baseErrorMessage}`;
  }
  return baseErrorMessage;
};

export const generateRandomIp = (): string => {
  const part1 = Math.floor(Math.random() * 255);
  const part2 = Math.floor(Math.random() * 255);
  return `(${part1}.${part2})`;
};

export const getCurrentTimestamp = (): string => {
  return createTimestamp();
};

export const getDetailedTimestamp = (dateOffset: number = 0): string => {
  return new Date(Date.now() - dateOffset).toISOString();
};

/** Canonical timestamp used by persisted and API domain objects. */
export const createTimestamp = (): string => new Date().toISOString();

const buildLocalDate = (
  year: number,
  month: number,
  day: number,
  period: string,
  hour: number,
  minute: number,
): Date | null => {
  const normalizedYear = year < 100 ? 2000 + year : year;
  const normalizedHour = period === '오후' ? (hour % 12) + 12 : hour % 12;
  const date = new Date(normalizedYear, month - 1, day, normalizedHour, minute, 0, 0);
  if (
    date.getFullYear() !== normalizedYear ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== normalizedHour ||
    date.getMinutes() !== minute
  )
    return null;
  return date;
};

/**
 * Parses canonical ISO timestamps and the three ko-KR strings written by
 * releases before v0.1.0. Missing date components use the supplied reference.
 */
export const parseStoredTimestamp = (value: string, reference = new Date()): Date | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const trimmed = value.trim();
  const directEpoch = Date.parse(trimmed);
  if (Number.isFinite(directEpoch)) return new Date(directEpoch);

  const detailed = trimmed.match(
    /^(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})$/,
  );
  if (detailed) {
    return buildLocalDate(
      Number(detailed[1]),
      Number(detailed[2]),
      Number(detailed[3]),
      detailed[4],
      Number(detailed[5]),
      Number(detailed[6]),
    );
  }

  const monthDay = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})$/);
  if (monthDay) {
    return buildLocalDate(
      reference.getFullYear(),
      Number(monthDay[1]),
      Number(monthDay[2]),
      monthDay[3],
      Number(monthDay[4]),
      Number(monthDay[5]),
    );
  }

  const timeOnly = trimmed.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    return buildLocalDate(
      reference.getFullYear(),
      reference.getMonth() + 1,
      reference.getDate(),
      timeOnly[1],
      Number(timeOnly[2]),
      Number(timeOnly[3]),
    );
  }
  return null;
};

export const timestampToEpoch = (value: string): number =>
  parseStoredTimestamp(value)?.getTime() ?? 0;

export const migrateTimestamp = (value: string, fallbackEpoch: number): string =>
  parseStoredTimestamp(value, new Date(fallbackEpoch))?.toISOString() ??
  new Date(fallbackEpoch).toISOString();

export const formatTimestamp = (value: string, options: { dateOnly?: boolean } = {}): string => {
  const date = parseStoredTimestamp(value);
  if (!date) return '날짜 정보 없음';
  return new Intl.DateTimeFormat(
    'ko-KR',
    options.dateOnly
      ? { year: '2-digit', month: '2-digit', day: '2-digit' }
      : {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        },
  ).format(date);
};

export const resolveUserNickname = (userProfile: UserProfile | null): string => {
  if (!userProfile) return '';

  if (userProfile.nicknameType === 'ANONYMOUS') {
    return `${userProfile.nickname}${userProfile.ip || ''}`;
  }
  return userProfile.nickname;
};
