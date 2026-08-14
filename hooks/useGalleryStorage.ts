import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  AiProvider,
  Comment,
  CreateGalleryParams,
  GalleryContextParams,
  GalleryData,
  GallerySessionV2,
  PersistedGalleryData,
  Post,
  UserProfile,
} from '../types';
import { AI_MODELS, DEFAULT_AI_PROVIDER, migrateModelForProvider } from '../constants';
import {
  createGalleryParamsSchema,
  gallerySessionV2Schema,
  generationWarningSchema,
  userProfileSchema,
} from '../schemas';
import { migrateTimestamp, timestampToEpoch } from '../utils/common';

export const SESSION_STORAGE_KEY = 'dcgm.session.v2';
export const LEGACY_SESSION_KEYS = ['galleryData', 'galleryContext', 'userProfile'] as const;
export const SEARCH_SESSION_STORAGE_WARNING =
  'Google 검색이 반영된 갤러리는 표시 요건을 위해 브라우저에 저장되지 않습니다. 현재 탭에서만 유지됩니다.';
export const BLOCKED_SEARCH_SESSION_WARNING =
  '저장된 Google 검색 갤러리는 필수 표시 정보를 함께 복원할 수 없어 열지 않았습니다. 브라우저의 원본 데이터는 보존했습니다.';
export const CORRUPT_SESSION_STORAGE_WARNING =
  '저장된 갤러리 데이터를 복원하지 못했습니다. 브라우저의 원본 데이터는 보존했습니다.';

interface GalleryStorageState {
  galleryData: GalleryData | null;
  galleryContext: GalleryContextParams | null;
  currentUserProfile: UserProfile | null;
  revision: number;
}

interface GalleryStorageLoadResult {
  state: GalleryStorageState;
  storageWarning: string | null;
  preserveStoredSession: boolean;
}

const EMPTY_STATE: GalleryStorageState = {
  galleryData: null,
  galleryContext: null,
  currentUserProfile: null,
  revision: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asSafeCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(1_000_000_000, Math.trunc(value))
    : null;

const migrateVote = (value: unknown): 'rec' | 'nonrec' | null | undefined =>
  value === 'rec' || value === 'nonrec' || value === null ? value : undefined;

const migrateComment = (value: unknown, fallbackEpoch: number): Comment | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.author !== 'string' ||
    !value.author.trim() ||
    typeof value.text !== 'string' ||
    !value.text.trim()
  )
    return null;
  const recommendations = asSafeCount(value.recommendations);
  const nonRecommendations = asSafeCount(value.nonRecommendations);
  if (recommendations === null || nonRecommendations === null) return null;
  const reply =
    isRecord(value.replyTo) &&
    typeof value.replyTo.commentId === 'string' &&
    typeof value.replyTo.author === 'string' &&
    value.replyTo.commentId.trim() &&
    value.replyTo.author.trim()
      ? {
          commentId: value.replyTo.commentId.trim().slice(0, 256),
          author: value.replyTo.author.trim().slice(0, 64),
        }
      : undefined;
  const voted = migrateVote(value.voted);
  return {
    id: value.id.trim().slice(0, 256),
    author: value.author.trim().slice(0, 64),
    text: value.text.trim().slice(0, 1_000),
    timestamp: migrateTimestamp(
      typeof value.timestamp === 'string' ? value.timestamp : '',
      fallbackEpoch,
    ),
    recommendations,
    nonRecommendations,
    ...(voted !== undefined ? { voted } : {}),
    ...(reply ? { replyTo: reply } : {}),
  };
};

const migratePost = (value: unknown, index: number, baseEpoch: number): Post | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    typeof value.author !== 'string' ||
    !value.author.trim() ||
    typeof value.content !== 'string' ||
    !value.content.trim()
  )
    return null;
  const views = asSafeCount(value.views);
  const recommendations = asSafeCount(value.recommendations);
  const nonRecommendations = asSafeCount(value.nonRecommendations);
  if (views === null || recommendations === null || nonRecommendations === null) return null;

  const fallbackTimestamp = baseEpoch - index * 1_000;
  const timestamp = migrateTimestamp(
    typeof value.timestamp === 'string' ? value.timestamp : '',
    fallbackTimestamp,
  );
  const postEpoch = timestampToEpoch(timestamp) || fallbackTimestamp;
  const comments = Array.isArray(value.comments)
    ? value.comments
        .map((comment, commentIndex) => migrateComment(comment, postEpoch + commentIndex))
        .filter((comment): comment is Comment => comment !== null)
        .slice(0, 30)
    : [];
  const voted = migrateVote(value.voted);
  return {
    id: value.id.trim().slice(0, 256),
    title: value.title.trim().slice(0, 200),
    author: value.author.trim().slice(0, 64),
    timestamp,
    content: value.content.trim().slice(0, 10_000),
    views,
    recommendations,
    nonRecommendations,
    comments,
    ...(typeof value.isBestPost === 'boolean' ? { isBestPost: value.isBestPost } : {}),
    ...(voted !== undefined ? { voted } : {}),
  };
};

export const migrateGalleryData = (value: unknown, baseEpoch = Date.now()): GalleryData | null => {
  if (!isRecord(value) || typeof value.galleryTitle !== 'string' || !value.galleryTitle.trim())
    return null;
  if (!Array.isArray(value.posts)) return null;
  const posts = value.posts
    .map((post, index) => migratePost(post, index, baseEpoch))
    .filter((post): post is Post => post !== null);
  const warningCandidates = Array.isArray(value.warnings) ? value.warnings : [];
  const warnings = warningCandidates
    .flatMap(warning => {
      const result = generationWarningSchema.safeParse(warning);
      return result.success ? [result.data] : [];
    })
    .slice(0, 100);
  return {
    galleryTitle: value.galleryTitle.trim().slice(0, 200),
    posts,
    ...(warnings.length ? { warnings } : {}),
  };
};

export const migrateGalleryContext = (value: unknown): GalleryContextParams | null => {
  if (!isRecord(value)) return null;
  const provider: AiProvider = value.selectedProvider === 'vertex' ? 'vertex' : DEFAULT_AI_PROVIDER;
  const model = migrateModelForProvider(
    typeof value.selectedModel === 'string' ? value.selectedModel : undefined,
    provider,
  );
  if (!AI_MODELS[provider].some(option => option.value === model)) return null;
  const candidate = {
    topic: value.topic,
    discussionContext: value.discussionContext,
    worldviewValue: value.worldviewValue,
    customWorldviewText: value.customWorldviewText,
    worldviewEraValue: value.worldviewEraValue,
    toxicityLevelValue: value.toxicityLevelValue,
    anonymousNickRatioValue: value.anonymousNickRatioValue,
    userSpecies: value.userSpecies,
    userAffiliation: value.userAffiliation,
    genderRatioValue: value.genderRatioValue,
    ageRangeValue: value.ageRangeValue,
    selectedProvider: provider,
    selectedModel: model,
    useSearch: value.useSearch,
    userProfile: value.userProfile,
  };
  // Importing the full request schema here keeps restored state on the same
  // contract as a fresh API request while preserving provider migrations.
  const result = createGalleryParamsSchema.safeParse(candidate);
  return result.success ? (result.data as CreateGalleryParams) : null;
};

const migrateUserProfile = (value: unknown): UserProfile | null => {
  if (!isRecord(value)) return null;
  const result = userProfileSchema.safeParse(value);
  return result.success ? result.data : null;
};

export const migrateGallerySession = (value: unknown): GallerySessionV2 | null => {
  if (!isRecord(value)) return null;
  const baseEpoch = Date.now();
  const gallery = migrateGalleryData(value.gallery, baseEpoch);
  const context = migrateGalleryContext(value.context);
  if (!gallery || !context) return null;
  const profile = value.profile === null ? null : migrateUserProfile(value.profile);
  const candidate: GallerySessionV2 = {
    version: 2,
    revision:
      typeof value.revision === 'number' &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0
        ? value.revision
        : 1,
    savedAt: migrateTimestamp(typeof value.savedAt === 'string' ? value.savedAt : '', baseEpoch),
    gallery,
    context,
    profile,
  };
  const result = gallerySessionV2Schema.safeParse(candidate);
  return result.success ? result.data : null;
};

const parseStoredValue = (storage: Storage, key: string): unknown => {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export const persistGallerySession = (storage: Storage, session: GallerySessionV2): boolean => {
  if (session.context.useSearch) return false;
  try {
    const gallery: PersistedGalleryData = {
      galleryTitle: session.gallery.galleryTitle,
      posts: session.gallery.posts,
      ...(session.gallery.warnings ? { warnings: session.gallery.warnings } : {}),
    };
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, gallery }));
    return true;
  } catch {
    return false;
  }
};

const removeLegacyKeys = (storage: Storage): void => {
  for (const key of LEGACY_SESSION_KEYS) storage.removeItem(key);
};

const hasStoredSearchContext = (value: unknown): boolean =>
  isRecord(value) && isRecord(value.context) && value.context.useSearch === true;

const loadGalleryStorageResult = (storage: Storage): GalleryStorageLoadResult => {
  const hasRawV2 = storage.getItem(SESSION_STORAGE_KEY) !== null;
  const rawV2 = parseStoredValue(storage, SESSION_STORAGE_KEY);
  if (hasStoredSearchContext(rawV2)) {
    return {
      state: EMPTY_STATE,
      storageWarning: BLOCKED_SEARCH_SESSION_WARNING,
      preserveStoredSession: true,
    };
  }

  const savedV2 = migrateGallerySession(rawV2);
  if (savedV2) {
    return {
      state: {
        galleryData: savedV2.gallery,
        galleryContext: savedV2.context,
        currentUserProfile: savedV2.profile,
        revision: savedV2.revision,
      },
      storageWarning: null,
      preserveStoredSession: false,
    };
  }

  const rawLegacyGallery = parseStoredValue(storage, 'galleryData');
  const rawLegacyContext = parseStoredValue(storage, 'galleryContext');
  if (
    rawLegacyGallery !== null &&
    isRecord(rawLegacyContext) &&
    rawLegacyContext.useSearch === true
  ) {
    return {
      state: EMPTY_STATE,
      storageWarning: BLOCKED_SEARCH_SESSION_WARNING,
      preserveStoredSession: true,
    };
  }
  const gallery = migrateGalleryData(rawLegacyGallery);
  const context = migrateGalleryContext(rawLegacyContext);
  if (!gallery || !context) {
    return hasRawV2
      ? {
          state: EMPTY_STATE,
          storageWarning: CORRUPT_SESSION_STORAGE_WARNING,
          preserveStoredSession: true,
        }
      : { state: EMPTY_STATE, storageWarning: null, preserveStoredSession: false };
  }
  const profile = migrateUserProfile(parseStoredValue(storage, 'userProfile'));
  const migrated: GallerySessionV2 = {
    version: 2,
    revision: 1,
    savedAt: new Date().toISOString(),
    gallery,
    context,
    profile,
  };
  if (persistGallerySession(storage, migrated)) removeLegacyKeys(storage);
  return {
    state: {
      galleryData: gallery,
      galleryContext: context,
      currentUserProfile: profile,
      revision: 1,
    },
    storageWarning: null,
    preserveStoredSession: false,
  };
};

export const loadGalleryStorageState = (storage: Storage): GalleryStorageState =>
  loadGalleryStorageResult(storage).state;

export const useGalleryStorage = () => {
  const [initialLoad] = useState<GalleryStorageLoadResult>(() => {
    try {
      return loadGalleryStorageResult(localStorage);
    } catch {
      return { state: EMPTY_STATE, storageWarning: null, preserveStoredSession: false };
    }
  });
  const [state, setState] = useState<GalleryStorageState>(initialLoad.state);
  const [storageWarning, setStorageWarning] = useState<string | null>(initialLoad.storageWarning);
  const preserveStoredSessionRef = useRef(initialLoad.preserveStoredSession);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  useEffect(() => {
    if (state.galleryContext?.useSearch) {
      preserveStoredSessionRef.current = true;
      setStorageWarning(SEARCH_SESSION_STORAGE_WARNING);
      return;
    }
    if (!state.galleryData || !state.galleryContext) {
      if (preserveStoredSessionRef.current) return;
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        setStorageWarning(
          '브라우저 저장소를 갱신하지 못했습니다. 현재 화면에서는 계속 사용할 수 있습니다.',
        );
      }
      return;
    }
    preserveStoredSessionRef.current = false;
    const session: GallerySessionV2 = {
      version: 2,
      revision: state.revision,
      savedAt: new Date().toISOString(),
      gallery: state.galleryData,
      context: state.galleryContext,
      profile: state.currentUserProfile,
    };
    setStorageWarning(
      persistGallerySession(localStorage, session)
        ? null
        : '브라우저 저장 공간이 부족해 현재 변경 내용이 저장되지 않았습니다.',
    );
  }, [state]);

  const setGalleryData: Dispatch<SetStateAction<GalleryData | null>> = useCallback(value => {
    setState(previous => ({
      ...previous,
      galleryData: typeof value === 'function' ? value(previous.galleryData) : value,
    }));
  }, []);

  const setGalleryContext: Dispatch<SetStateAction<GalleryContextParams | null>> = useCallback(
    value => {
      setState(previous => {
        const galleryContext = typeof value === 'function' ? value(previous.galleryContext) : value;
        if (galleryContext) preserveStoredSessionRef.current = galleryContext.useSearch;
        return {
          ...previous,
          galleryContext,
          revision: previous.revision + 1,
        };
      });
    },
    [],
  );

  const setCurrentUserProfile: Dispatch<SetStateAction<UserProfile | null>> = useCallback(value => {
    setState(previous => ({
      ...previous,
      currentUserProfile: typeof value === 'function' ? value(previous.currentUserProfile) : value,
    }));
  }, []);

  const replaceSession = useCallback(
    (
      galleryData: GalleryData,
      galleryContext: GalleryContextParams,
      currentUserProfile: UserProfile | null,
    ) => {
      preserveStoredSessionRef.current = galleryContext.useSearch;
      setState(previous => ({
        galleryData,
        galleryContext,
        currentUserProfile,
        revision: previous.revision + 1,
      }));
      setSelectedPostId(null);
    },
    [],
  );

  const selectPost = useCallback((postId: string) => {
    setSelectedPostId(postId);
    window.scrollTo(0, 0);
  }, []);

  const backToList = useCallback(() => {
    setSelectedPostId(null);
    window.scrollTo(0, 0);
  }, []);

  return useMemo(
    () => ({
      galleryData: state.galleryData,
      setGalleryData,
      galleryContext: state.galleryContext,
      setGalleryContext,
      currentUserProfile: state.currentUserProfile,
      setCurrentUserProfile,
      revision: state.revision,
      storageWarning,
      replaceSession,
      selectedPostId,
      setSelectedPostId,
      selectPost,
      backToList,
    }),
    [
      backToList,
      replaceSession,
      selectPost,
      selectedPostId,
      setCurrentUserProfile,
      setGalleryContext,
      setGalleryData,
      state,
      storageWarning,
    ],
  );
};
