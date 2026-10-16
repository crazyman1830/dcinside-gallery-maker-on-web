import { expect, test, type Page, type Route } from '@playwright/test';
import type { CreateGalleryRequest, GalleryData, GallerySessionV2, Post } from '../types';

const timestamp = '2026-10-03T00:00:00.000Z';
const existingComment = {
  id: 'existing-comment',
  author: '기존 고정닉',
  text: '원래 있던 댓글을 보존해주세요.',
  timestamp,
  recommendations: 2,
  nonRecommendations: 0,
};
const generatedComment = {
  id: 'recovered-comment',
  author: '복구 고정닉',
  text: '복구한 AI 댓글입니다.',
  timestamp: '2026-10-03T00:01:00.000Z',
  recommendations: 0,
  nonRecommendations: 0,
};
const gallery: GalleryData = {
  galleryTitle: '개선 기능 테스트 갤러리',
  posts: Array.from({ length: 5 }, (_, index) => ({
    id: `improvement-post-${index + 1}`,
    title: `기존 글 ${index + 1}`,
    author: '작성자',
    timestamp,
    content: `외부 AI 없이 검증하는 기존 본문 ${index + 1}`,
    views: 42,
    recommendations: 7,
    nonRecommendations: 1,
    comments: index === 0 ? [existingComment] : [],
  })),
};
const pageErrors = new WeakMap<Page, string[]>();
const unexpectedRequests = new WeakMap<Page, string[]>();
const streamGallery = (route: Route, data = gallery) =>
  route.fulfill({
    status: 200,
    contentType: 'application/x-ndjson; charset=utf-8',
    body: `${JSON.stringify({ type: 'result', data })}\n`,
  });
const readSession = (page: Page): Promise<GallerySessionV2> =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('dcgm.session.v2') ?? 'null') as GallerySessionV2,
  );
const submitGallery = async (page: Page) => {
  await page.getByLabel(/갤러리 주제/).fill('개선 기능 테스트');
  await page.getByRole('button', { name: '갤러리 생성', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: gallery.galleryTitle, exact: true }),
  ).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  const unmocked: string[] = [];
  pageErrors.set(page, errors);
  unexpectedRequests.set(page, unmocked);
  page.on('pageerror', error => errors.push(error.message));
  // Every AI endpoint is blocked unless a test explicitly replaces this mock.
  await page.route('**/api/ai/**', route => {
    unmocked.push(route.request().url());
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unmocked AI request' }),
    });
  });
  await page.route('**/api/ai/credentials', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: { gemini: { configured: true }, vertex: { configured: false } },
        capabilities: { vertexAdc: false },
      }),
    }),
  );
  await page.route('**/api/ai/gallery/stream', route => streamGallery(route));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
  expect(
    unexpectedRequests.get(page),
    'An AI endpoint was requested without a local mock.',
  ).toEqual([]);
});

test('saves fixed nicknames and adds a new event while retaining the worldline and existing posts', async ({
  page,
}, testInfo) => {
  const requests: CreateGalleryRequest[] = [];
  await page.route('**/api/ai/gallery/stream', route => {
    requests.push(route.request().postDataJSON() as CreateGalleryRequest);
    return streamGallery(
      route,
      requests.length === 1
        ? gallery
        : {
            ...gallery,
            posts: gallery.posts.map(post => ({
              ...post,
              id: `continued-${post.id}`,
              title: `새 사건 ${post.title}`,
            })),
          },
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^고정닉 설정/ }).click();
  const dialog = page.getByRole('dialog', { name: '갤러리 고정닉 설정' });
  await dialog.getByRole('button', { name: '고정닉 추가', exact: true }).click();
  await dialog.getByLabel('닉네임', { exact: true }).fill('검술고수');
  await dialog.getByLabel('활동 빈도').selectOption('frequent');
  await dialog.getByLabel('성격과 입장').fill('정파 출신이며 실전을 중시한다.');
  await dialog.getByLabel('말투', { exact: true }).fill('짧은 반말과 무림 속담');
  const nicknameScreenshot = testInfo.outputPath('fixed-nicknames-dialog.png');
  await page.screenshot({ path: nicknameScreenshot, fullPage: true });
  await testInfo.attach('고정닉 설정창', { path: nicknameScreenshot, contentType: 'image/png' });
  await dialog.getByRole('button', { name: '고정닉 저장', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(page.getByRole('button', { name: '갤러리 생성', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '고정닉 설정 (1/8)', exact: true })).toBeVisible();
  await submitGallery(page);
  expect(requests).toHaveLength(1);
  expect(requests[0].fixedNicknames).toEqual([
    {
      id: expect.any(String),
      nickname: '검술고수',
      activity: 'frequent',
      description: '정파 출신이며 실전을 중시한다.',
      speechStyle: '짧은 반말과 무림 속담',
    },
  ]);
  await page.getByRole('button', { name: '게시물 기존 글 1 보기', exact: true }).click();
  await page.getByRole('button', { name: '추천 7개', exact: true }).click();
  await expect
    .poll(async () => {
      const saved = await readSession(page);
      return {
        recommendations: saved.gallery.posts[0].recommendations,
        voted: saved.gallery.posts[0].voted,
      };
    })
    .toEqual({ recommendations: 8, voted: 'rec' });
  const before = await readSession(page);
  await page.getByRole('button', { name: '게시물 목록으로 돌아가기', exact: true }).click();
  await page.getByText('세계관 기억과 이어서 생성', { exact: true }).click();
  await page
    .getByLabel('다음 사건 / 새 떡밥 (선택)')
    .fill('비무대회 결승 직후 승부조작 의혹이 터졌다.');
  await page.getByLabel('세계관 메모').fill('검술고수는 정파 출신이며 결승전을 직접 관람했다.');
  await page.getByRole('button', { name: '메모 저장', exact: true }).click();
  await expect(page.getByLabel('다음 사건 / 새 떡밥 (선택)')).toHaveValue(
    '비무대회 결승 직후 승부조작 의혹이 터졌다.',
  );
  await expect(
    page.getByRole('button', { name: '이 세계관에서 새 글 5개 추가', exact: true }),
  ).toBeEnabled();
  const continuationScreenshot = testInfo.outputPath('continuation-event-panel.png');
  await page.screenshot({ path: continuationScreenshot, fullPage: true });
  await testInfo.attach('메모 저장 후 새 사건 초안', {
    path: continuationScreenshot,
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: '이 세계관에서 새 글 5개 추가', exact: true }).click();
  await expect(page.getByText('10개 게시물', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].discussionContext).toBe('비무대회 결승 직후 승부조작 의혹이 터졌다.');
  expect(requests[1].fixedNicknames).toEqual(requests[0].fixedNicknames);
  expect(requests[1].continuityNotes).toBe('검술고수는 정파 출신이며 결승전을 직접 관람했다.');
  expect(requests[1].continuationContext?.totalPostCount).toBe(5);
  await expect.poll(async () => (await readSession(page)).gallery.posts.length).toBe(10);
  const after = await readSession(page);
  expect(after.context.worldlineId).toBe(before.context.worldlineId);
  expect(after.gallery.posts).toHaveLength(10);
  expect(after.gallery.posts.filter(post => !post.id.startsWith('continued-'))).toEqual(
    before.gallery.posts,
  );
  await page.reload();
  await expect(page.getByText('10개 게시물', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '고정닉 설정 (1/8)', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('닉네임', { exact: true })).toHaveValue(
    '검술고수',
  );
});

for (const stage of ['evaluation', 'comments'] as const) {
  test(`retries only the failed ${stage} stage and preserves votes and existing comments`, async ({
    page,
  }) => {
    const requests: { stage: string; post: Post }[] = [];
    await page.route('**/api/ai/gallery/stream', route =>
      streamGallery(route, {
        ...gallery,
        warnings: [
          {
            code: 'MOCK_STAGE_FAILURE',
            message: 'mock 단계 실패',
            stage,
            postId: gallery.posts[0].id,
          },
        ],
      }),
    );
    await page.route('**/api/ai/posts/retry-stage', route => {
      const payload = route.request().postDataJSON() as { stage: string; post: Post };
      requests.push(payload);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          post:
            stage === 'evaluation'
              ? // The server contract includes the existing user vote in its new baseline.
                { ...payload.post, views: 90, recommendations: 21, comments: [] }
              : {
                  ...payload.post,
                  recommendations: 999,
                  comments: [{ ...existingComment, recommendations: 999 }, generatedComment],
                },
          warnings: [],
        }),
      });
    });
    await page.goto('/');
    await submitGallery(page);
    await expect(page.getByRole('list', { name: '갤러리 생성 경고' })).toContainText(
      stage === 'evaluation' ? '반응 수치 평가 실패' : '댓글 생성 실패',
    );
    await page.getByRole('button', { name: '게시물 기존 글 1 보기', exact: true }).click();
    await page.getByRole('button', { name: '추천 7개', exact: true }).click();
    await page.getByRole('button', { name: '실패 지점에서 재시도', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '실패 지점에서 재시도', exact: true }),
    ).toHaveCount(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].stage).toBe(stage);
    expect(requests[0].post.id).toBe(gallery.posts[0].id);
    expect(requests[0].post).toMatchObject({ recommendations: 8, voted: 'rec' });
    const saved = await readSession(page);
    const post = saved.gallery.posts[0];
    expect(saved.gallery.warnings).toEqual([]);
    expect(post.recommendations).toBe(stage === 'evaluation' ? 21 : 8);
    expect(post.voted).toBe('rec');
    expect(post.comments.find(comment => comment.id === existingComment.id)).toEqual(
      existingComment,
    );
    expect(post.comments).toHaveLength(stage === 'evaluation' ? 1 : 2);
    expect(saved.gallery.posts.slice(1)).toEqual(gallery.posts.slice(1));
    await expect(page.getByText(existingComment.text, { exact: true })).toBeVisible();
    if (stage === 'comments')
      await expect(page.getByText(generatedComment.text, { exact: true })).toBeVisible();
  });
}

test('restores a failed user reaction after reload and retries without duplicating the user comment', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/ai/comments/follow-up', route => {
    calls += 1;
    return route.fulfill({
      status: calls === 1 ? 502 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        calls === 1 ? { error: 'mock recoverable failure', retryable: true } : [generatedComment],
      ),
    });
  });
  await page.goto('/');
  await submitGallery(page);
  await page.getByRole('button', { name: '게시물 기존 글 1 보기', exact: true }).click();
  await page.getByLabel('댓글 내용').fill('새로고침 뒤 복구할 사용자 댓글');
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI 반응 다시 생성', exact: true })).toBeVisible();
  const before = await readSession(page);
  const failedComment = before.gallery.posts[0].comments.find(
    comment => comment.text === '새로고침 뒤 복구할 사용자 댓글',
  );
  expect(failedComment?.reactionFailure).toMatchObject({
    retryable: true,
    message: expect.stringContaining('mock recoverable failure'),
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'AI 반응 다시 생성', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI 반응 다시 생성', exact: true }).click();
  await expect(page.getByText(generatedComment.text, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI 반응 다시 생성', exact: true })).toHaveCount(0);
  const after = await readSession(page);
  const restored = after.gallery.posts[0].comments.filter(
    comment => comment.id === failedComment?.id,
  );
  expect(restored).toHaveLength(1);
  expect(restored[0]).not.toHaveProperty('reactionFailure');
  expect(
    after.gallery.posts[0].comments.filter(
      comment => comment.text === '새로고침 뒤 복구할 사용자 댓글',
    ),
  ).toHaveLength(1);
  expect(
    after.gallery.posts[0].comments.find(comment => comment.id === existingComment.id),
  ).toEqual(existingComment);
  expect(calls).toBe(2);
});
