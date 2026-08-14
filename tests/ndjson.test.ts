import { describe, expect, it, vi } from 'vitest';
import {
  createGalleryStreamed,
  GROUNDING_SEARCH_ENTRY_POINT_MAX_BYTES,
  NDJSON_MAX_LINE_BYTES,
  NDJSON_MAX_TOTAL_BYTES,
  parseNdjsonStream,
} from '../services/galleryService';

const streamFromText = (text: string): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
};

describe('NDJSON stream parser', () => {
  it('preserves events split across transport chunks', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"chunk","text":"hel'));
        controller.enqueue(encoder.encode('lo"}\n{"type":"phase","phase":"posts"}\n'));
        controller.close();
      },
    });
    const events: unknown[] = [];
    await parseNdjsonStream(stream, event => events.push(event));
    expect(events).toEqual([
      { type: 'chunk', text: 'hello' },
      { type: 'phase', phase: 'posts' },
    ]);
  });

  it('rejects malformed event data', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('not-json\n'));
        controller.close();
      },
    });
    await expect(parseNdjsonStream(stream, () => undefined)).rejects.toThrow(
      '올바르지 않은 스트림',
    );
  });

  it.each([
    '{"type":"chunk","text":12}\n',
    '{"type":"phase","phase":12}\n',
    '{"type":"warning","warning":{"message":"missing code"}}\n',
    '{"type":"result","data":{"galleryTitle":"x","posts":"not-an-array"}}\n',
    '{"type":"unknown","text":"x"}\n',
  ])('rejects invalid event payloads: %s', async line => {
    await expect(parseNdjsonStream(streamFromText(line), () => undefined)).rejects.toThrow(
      '올바르지 않은 스트림 이벤트',
    );
  });

  it('accepts typed phase, warning, and structured error metadata', async () => {
    const events: unknown[] = [];
    await parseNdjsonStream(
      streamFromText(
        [
          '{"type":"phase","phase":"posts","message":"댓글 생성 중","progress":70}',
          '{"type":"warning","warning":{"code":"COMMENTS_PARTIAL","message":"일부 댓글 누락","stage":"comments","postId":"post-1"}}',
          '{"type":"error","message":"잠시 후 재시도","code":"RATE_LIMIT","retryable":true,"requestId":"req-1"}',
          '',
        ].join('\n'),
      ),
      event => events.push(event),
    );

    expect(events).toEqual([
      { type: 'phase', phase: 'posts', message: '댓글 생성 중', progress: 70 },
      {
        type: 'warning',
        warning: {
          code: 'COMMENTS_PARTIAL',
          message: '일부 댓글 누락',
          stage: 'comments',
          postId: 'post-1',
        },
      },
      {
        type: 'error',
        message: '잠시 후 재시도',
        code: 'RATE_LIMIT',
        retryable: true,
        requestId: 'req-1',
      },
    ]);
  });

  it('preserves valid Search Suggestions markup exactly and rejects invalid metadata', async () => {
    const renderedContent = '<style>.chip { color: blue; }</style><a>검색어</a>';
    const events: unknown[] = [];
    await parseNdjsonStream(
      streamFromText(
        `${JSON.stringify({
          type: 'result',
          data: { galleryTitle: '테스트', posts: [], searchEntryPoint: { renderedContent } },
        })}\n`,
      ),
      event => events.push(event),
    );

    expect(events).toEqual([
      {
        type: 'result',
        data: { galleryTitle: '테스트', posts: [], searchEntryPoint: { renderedContent } },
      },
    ]);

    const oversized = '가'.repeat(GROUNDING_SEARCH_ENTRY_POINT_MAX_BYTES);
    await expect(
      parseNdjsonStream(
        streamFromText(
          `${JSON.stringify({
            type: 'result',
            data: {
              galleryTitle: '테스트',
              posts: [],
              searchEntryPoint: { renderedContent: oversized },
            },
          })}\n`,
        ),
        () => undefined,
      ),
    ).rejects.toThrow('올바르지 않은 스트림 이벤트');
  });

  it('deduplicates warnings repeated in events and the final result', async () => {
    const warning = {
      code: 'COMMENTS_PARTIAL',
      message: '일부 댓글 누락',
      stage: 'comments' as const,
      postId: 'post-1',
    };
    const body = streamFromText(
      [
        JSON.stringify({ type: 'warning', warning }),
        JSON.stringify({
          type: 'result',
          data: { galleryTitle: '테스트', posts: [], warnings: [warning] },
        }),
        '',
      ].join('\n'),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    try {
      const result = await createGalleryStreamed({} as never, () => undefined);
      expect(result.warnings).toEqual([warning]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a single line over 512 KiB', async () => {
    const oversizedLine = JSON.stringify({
      type: 'chunk',
      text: 'x'.repeat(NDJSON_MAX_LINE_BYTES),
    });
    await expect(parseNdjsonStream(streamFromText(oversizedLine), () => undefined)).rejects.toThrow(
      '한 줄 크기',
    );
  });

  it('rejects total stream input over 1 MiB even when each line is small', async () => {
    const line = `${JSON.stringify({ type: 'chunk', text: 'x'.repeat(128 * 1024) })}\n`;
    const payload = line.repeat(
      Math.ceil(NDJSON_MAX_TOTAL_BYTES / new TextEncoder().encode(line).byteLength) + 1,
    );
    await expect(parseNdjsonStream(streamFromText(payload), () => undefined)).rejects.toThrow(
      '전체 크기',
    );
  });

  it('cancels the reader and rejects with AbortError when interrupted', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const parsing = parseNdjsonStream(stream, () => undefined, controller.signal);
    controller.abort();

    await expect(parsing).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true);
  });
});
