export const WORLDLINE_ID_PATTERN = /^WL-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export const createWorldlineId = (): string => {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('이 브라우저에서는 안전한 세계선 번호를 생성할 수 없습니다.');
  }
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const hex = [...bytes]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `WL-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
};
