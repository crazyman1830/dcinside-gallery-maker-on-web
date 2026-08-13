import { describe, expect, it } from 'vitest';
import { parseNdjsonStream } from '../services/galleryService';

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
    await expect(parseNdjsonStream(stream, () => undefined))
      .rejects.toThrow('올바르지 않은 스트림');
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
