import { describe, expect, it } from 'vitest';
import {
  extractJsonString,
  parseGeminiCommentArrayResponse,
  parseGeminiEvaluationResponse,
  parseGeminiResponse,
  parseProtectedJson,
  isGeminiCommentContentArray,
  isGeminiEvaluationResponse,
  isGeminiResponseData,
  stripJsonComments,
} from '../utils/jsonParser';

describe('protected JSON parsing', () => {
  it('preserves comment markers and URLs inside JSON strings', () => {
    const source = `{
      // provider preamble comment
      "galleryTitle": "https://example.test/a//b",
      "posts": [{
        "title": "literal // text",
        "author": "tester",
        "content": "escaped quote: \\" and /* text */"
      }]
    }`;

    const parsed = parseGeminiResponse(source);
    expect(parsed.galleryTitle).toBe('https://example.test/a//b');
    expect(parsed.posts[0]?.title).toBe('literal // text');
    expect(parsed.posts[0]?.content).toContain('/* text */');
  });

  it('extracts a balanced fenced payload with braces in strings', () => {
    const text =
      '설명입니다.\n```json\n{"galleryTitle":"{ok}","posts":[{"title":"t","author":"a","content":"[x]"}]}\n```\n끝';
    expect(JSON.parse(extractJsonString(text))).toHaveProperty('galleryTitle', '{ok}');
  });

  it('removes actual block and line comments only', () => {
    const result = stripJsonComments('{/*x*/"value":"// kept" // removed\n}');
    expect(JSON.parse(result)).toEqual({ value: '// kept' });
  });

  it('rejects malformed post elements instead of passing them through', () => {
    expect(() =>
      parseGeminiResponse('{"galleryTitle":"g","posts":[null,42,{"title":{}}]}'),
    ).toThrow(/형식/);
  });

  it('rejects empty or malformed comments', () => {
    expect(() => parseGeminiCommentArrayResponse('[{"author":"a","text":""}]')).toThrow(/댓글/);
    expect(() => parseGeminiCommentArrayResponse('{"unexpected":[]}')).toThrow(/댓글 배열/);
  });

  it.each([-1, 1.5, Number.MAX_VALUE])('rejects invalid evaluation metric %s', value => {
    expect(() =>
      parseGeminiEvaluationResponse(
        JSON.stringify({
          suggestedViews: value,
          suggestedRecommendations: 1,
          suggestedNonRecommendations: 0,
        }),
      ),
    ).toThrow(/평가 지표/);
  });

  it('supports comment wrapper aliases and strips unknown provider fields', () => {
    expect(
      parseGeminiCommentArrayResponse(
        JSON.stringify({
          replies: [
            {
              nickname: '별명',
              message: '답글',
              recommendations: 2,
              nonRecommendations: 0,
              ignored: 'field',
            },
          ],
        }),
      ),
    ).toEqual([{ author: '별명', text: '답글', recommendations: 2, nonRecommendations: 0 }]);
    expect(() => parseGeminiCommentArrayResponse('{"comments":{}}')).toThrow(/배열/);
  });

  it('exposes runtime guards and protected parser errors without leaking input', () => {
    const valid = {
      galleryTitle: 'g',
      posts: [{ title: 't', author: 'a', content: 'c' }],
    };
    expect(isGeminiResponseData(valid)).toBe(true);
    expect(isGeminiResponseData({ galleryTitle: 'g', posts: [null] })).toBe(false);
    expect(isGeminiCommentContentArray([{ author: 'a', text: 't' }])).toBe(true);
    expect(isGeminiCommentContentArray({})).toBe(false);
    expect(
      isGeminiEvaluationResponse({
        suggestedViews: 1,
        suggestedRecommendations: 0,
        suggestedNonRecommendations: 0,
      }),
    ).toBe(true);

    expect(
      parseProtectedJson('{"ok":true}', (value): value is { ok: true } => Boolean(value), 'test'),
    ).toEqual({ ok: true });
    expect(() =>
      parseProtectedJson('{"secret":"private"}', (_value): _value is never => false, 'test'),
    ).toThrow(/데이터 구조/);
    expect(() => extractJsonString('prose [broken} only')).toThrow(/찾지 못했습니다/);
  });
});
