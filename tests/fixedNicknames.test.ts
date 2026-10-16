import { describe, expect, it } from 'vitest';
import { createGalleryParamsSchema, fixedNicknamesSchema } from '../schemas';
import { buildSimulationContextData } from '../services/prompts/simulationContext';
import { migrateGalleryContext } from '../hooks/useGalleryStorage';
import { DEFAULT_MODEL_BY_PROVIDER } from '../constants';
import type { GalleryContextParams } from '../types';

const regular = {
  id: 'fixed-1',
  nickname: '검술고수',
  description: '정파 출신',
  speechStyle: '짧은 반말',
  activity: 'frequent' as const,
};
const context: GalleryContextParams = {
  worldlineId: 'WL-1111-2222-3333',
  topic: '무공',
  discussionContext: '',
  worldviewValue: 'MURIM',
  worldviewEraValue: 'ANCIENT',
  toxicityLevelValue: 'MILD',
  anonymousNickRatioValue: 'BALANCED',
  userSpecies: '',
  userAffiliation: '',
  genderRatioValue: 'AUTO',
  ageRangeValue: 'AUTO',
  selectedProvider: 'gemini',
  selectedModel: DEFAULT_MODEL_BY_PROVIDER.gemini,
  useSearch: false,
  fixedNicknames: [regular],
};

describe('fixed nickname configuration contracts', () => {
  it('preserves configured characters during stored context migration and prompt projection', () => {
    expect(migrateGalleryContext(context)?.fixedNicknames).toEqual([regular]);
    expect(buildSimulationContextData(context)).toMatchObject({
      fixedNicknames: [
        {
          nickname: regular.nickname,
          description: regular.description,
          speechStyle: regular.speechStyle,
          activity: 'frequent',
        },
      ],
    });
    expect(buildSimulationContextData(context).fixedNicknames?.[0]).not.toHaveProperty('id');
  });
  it('rejects ambiguous identities, duplicate names and oversized rosters', () => {
    expect(fixedNicknamesSchema.safeParse([{ ...regular, nickname: 'ㅇㅇ' }]).success).toBe(false);
    expect(
      fixedNicknamesSchema.safeParse([regular, { ...regular, id: 'another-id' }]).success,
    ).toBe(false);
    expect(
      fixedNicknamesSchema.safeParse(
        Array.from({ length: 9 }, (_, i) => ({ ...regular, id: `${i}`, nickname: `고정닉${i}` })),
      ).success,
    ).toBe(false);
    const { worldlineId: _id, ...params } = context;
    expect(
      createGalleryParamsSchema.safeParse({
        ...params,
        userProfile: { nicknameType: 'FIXED', nickname: regular.nickname, reputation: 50 },
      }).success,
    ).toBe(false);
  });
});
