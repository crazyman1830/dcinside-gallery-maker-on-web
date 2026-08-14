import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment, CreateGalleryParams, Post, UserProfile } from '../types';
import {
  buildCommentGenerationPrompt,
  buildFollowUpCommentPrompt,
} from '../services/prompts/comments';
import {
  buildPostEvaluationPrompt,
  buildWorldviewFeedbackPrompt,
} from '../services/prompts/evaluation';
import { buildGalleryGenerationPrompt } from '../services/prompts/gallery';
import {
  generatePlayerStatusInstructions,
  generateToxicitySpecificInstructions,
  generateUserProfileInstructions,
  generateWorldviewSpecificInstructions,
  getNicknameInstructionDetails,
} from '../services/prompts/instructions';

const context: CreateGalleryParams = {
  topic: '고양이',
  discussionContext: '새벽 소음',
  worldviewValue: 'NONE',
  worldviewEraValue: 'CONTEMPORARY',
  toxicityLevelValue: 'MEDIUM',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedProvider: 'gemini',
  selectedModel: 'gemini-3.5-flash',
  useSearch: false,
};

const post: Pick<Post, 'title' | 'author' | 'content'> = {
  title: '제목',
  author: '작성자',
  content: '내용',
};

afterEach(() => vi.restoreAllMocks());

describe('prompt contracts', () => {
  it.each([
    ['PREHISTORIC', 'Stone Age', 'Metal'],
    ['ANCIENT', 'Ancient Era', 'Gunpowder'],
    ['MEDIEVAL', 'Medieval Era', 'Trucks'],
    ['EARLY_MODERN', 'Early Modern', 'Internet'],
    ['CONTEMPORARY', 'Modern Day', 'Standard modern'],
    ['NEAR_FUTURE', 'Near Future', 'advanced tech'],
    ['FAR_FUTURE', 'Far Future', 'futuristic tech'],
    ['UNKNOWN', 'Modern Day', ''],
  ])('maps era %s to constraints', (era, description, constraint) => {
    const result = generateWorldviewSpecificInstructions('NONE', undefined, era);
    expect(result.worldviewSpecificInstructions).toContain(description);
    expect(result.eraConstraints).toContain(constraint);
  });

  it.each([
    ['CUSTOM', 'Custom'],
    ['MURIM', 'Murim'],
    ['FANTASY', 'Western Fantasy'],
    ['NONE', 'Earth'],
  ])('maps worldview %s', (worldview, expected) => {
    expect(
      generateWorldviewSpecificInstructions(worldview, '설정', '').worldviewSpecificInstructions,
    ).toContain(expected);
  });

  it.each([
    ['MILD', 'Polite'],
    ['MEDIUM', 'Casual'],
    ['SPICY', 'Aggressive'],
    ['unknown', 'Casual'],
  ])('maps toxicity %s', (toxicity, expected) => {
    expect(generateToxicitySpecificInstructions(toxicity).toxicitySpecificInstructions).toContain(
      expected,
    );
  });

  it('builds optional demographics and nickname rules', () => {
    expect(generateUserProfileInstructions('엘프', '길드', '70', ['TEENS', 'TWENTIES'])).toMatch(
      /Species.*Affiliation.*70% Male.*Age Group/s,
    );
    expect(generateUserProfileInstructions('', '', 'AUTO', 'AUTO')).not.toContain('Species');
    expect(getNicknameInstructionDetails('unknown')).toContain('Nickname Protocol');
  });

  it.each([
    [0, 'PUBLIC ENEMY'],
    [30, 'UNPOPULAR'],
    [50, 'NEUTRAL'],
    [70, 'POPULAR'],
    [100, 'LEGEND'],
  ])('maps reputation %s', (reputation, expected) => {
    const fixed: UserProfile = { nicknameType: 'FIXED', nickname: 'user', reputation };
    const anonymous: UserProfile = {
      nicknameType: 'ANONYMOUS',
      nickname: 'ㅇㅇ',
      ip: '(1.2)',
      reputation,
    };
    expect(generatePlayerStatusInstructions(fixed)).toContain(expected);
    expect(generatePlayerStatusInstructions(fixed)).toContain('STRICT IMPERSONATION BAN');
    expect(generatePlayerStatusInstructions(anonymous)).toContain('ㅇㅇ(1.2)');
  });

  it('returns no user instructions without a profile', () => {
    expect(generatePlayerStatusInstructions()).toBe('');
  });

  it('builds gallery prompts for search, custom eras and standard JSON output', () => {
    const standard = buildGalleryGenerationPrompt(context).prompt;
    expect(standard).toContain('Generate EXACTLY 5 posts');

    const searched = buildGalleryGenerationPrompt({
      ...context,
      worldviewValue: 'CUSTOM',
      customWorldviewText: '네온 도시',
      worldviewEraValue: 'NEAR_FUTURE',
      useSearch: true,
      userProfile: { nicknameType: 'ANONYMOUS', nickname: 'ㅇㅇ', ip: '(1.2)', reputation: 10 },
    }).prompt;
    expect(searched).toContain('EXCLUSIVE SEARCH FOCUS');
    expect(searched).toContain('JSON OUTPUT SPECIFICATION');
    expect(searched).toContain('ERA COMPLIANCE');
    expect(searched).toContain('(1.2)');
  });

  it('builds comment and follow-up prompts with bounded deterministic counts', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const userProfile: UserProfile = { nicknameType: 'FIXED', nickname: '나님', reputation: 90 };
    const withProfile = { ...context, userProfile };
    const commentPrompt = buildCommentGenerationPrompt(
      { ...post, author: '나님' },
      withProfile,
      5,
      10,
    );
    expect(commentPrompt.numberOfCommentsToGenerate).toBe(10);
    expect(commentPrompt.prompt).toContain('TARGET DETECTED');

    const comments: Comment[] = [
      {
        id: 'c1',
        author: '나님',
        text: 'hello',
        timestamp: new Date().toISOString(),
        recommendations: 0,
        nonRecommendations: 0,
      },
    ];
    const followUp = buildFollowUpCommentPrompt(post, comments, withProfile, 1, 4);
    expect(followUp.numberOfCommentsToGenerate).toBe(4);
    expect(followUp.prompt).toContain('CURRENT USER COMMENT');

    const unrelated = buildFollowUpCommentPrompt(
      post,
      [{ ...comments[0], author: 'other' }],
      { ...context, userProfile: undefined },
      1,
      1,
    );
    expect(unrelated.prompt).not.toContain('TARGET DETECTED');
  });

  it('builds evaluation and feedback prompts even without posts', () => {
    expect(buildPostEvaluationPrompt(post, context).prompt).toContain('EVALUATION LOGIC');
    expect(
      buildWorldviewFeedbackPrompt('world', { galleryTitle: 'g', posts: [] }).prompt,
    ).toContain('Sample Content');
  });
});
