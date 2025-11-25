
import {
    generateGalleryStreamFromGemini,
    generateCommentsForUserPost,
    evaluateUserPostContent,
    generateFollowUpCommentsForPost,
    isApiKeyAvailable as isGeminiApiKeyAvailable,
    API_KEY_MISSING_ERROR_MESSAGE,
    generateWorldviewFeedback,
} from './geminiService';
import { parseGeminiResponse } from '../utils/jsonParser';
import { getDetailedTimestamp, getCurrentTimestamp } from '../utils/common';
import { GalleryData, Post, Comment, GeminiResponseData, GeminiPostContent, GeminiCommentContent, UserProfile, GroundingSource } from '../types';
import {
    MIN_COMMENTS_PER_POST, MAX_COMMENTS_PER_POST,
    MIN_COMMENTS_PER_BEST_POST, MAX_COMMENTS_PER_BEST_POST,
    MIN_AI_FOLLOW_UP_COMMENTS, MAX_AI_FOLLOW_UP_COMMENTS,
    POST_AUTHOR_PREFIX,
    NUMBER_OF_POSTS,
    DEFAULT_ERROR_MESSAGE,
} from '../constants';

export const isApiKeyAvailable = isGeminiApiKeyAvailable;

export interface CreateGalleryParams {
    topic: string;
    discussionContext: string;
    worldviewValue: string;
    customWorldviewText?: string;
    worldviewEraValue: string;
    toxicityLevelValue: string;
    anonymousNickRatioValue: string;
    userSpecies: string;
    userAffiliation: string;
    genderRatioValue: string;
    ageRangeValue: string | string[];
    selectedModel: string;
    useSearch: boolean;
    userProfile?: UserProfile;
}

export type GalleryContextParams = CreateGalleryParams;

const ensureUniqueCommentAuthor = (currentCommentAuthor: string, postAuthor: string, fallbackIndex: number): string => {
    let finalCommentAuthor = currentCommentAuthor || `댓_${fallbackIndex + 1}`;
    if (finalCommentAuthor === postAuthor) {

        finalCommentAuthor = `${POST_AUTHOR_PREFIX}${finalCommentAuthor}`;
    }
    return finalCommentAuthor;
};

export const createGalleryStreamed = async (
    params: CreateGalleryParams,
    onChunk: (text: string) => void
): Promise<GalleryData> => {
    try {
        const stream = await generateGalleryStreamFromGemini(
            params.topic,
            params.discussionContext,
            params.worldviewValue,
            params.customWorldviewText,
            params.worldviewEraValue,
            params.toxicityLevelValue,
            params.anonymousNickRatioValue,
            params.userSpecies,
            params.userAffiliation,
            params.genderRatioValue,
            params.ageRangeValue,
            params.selectedModel,
            params.useSearch,
            params.userProfile
        );

        let responseText = '';
        const collectedGroundingChunks: GroundingSource[] = [];

        for await (const chunk of stream) {
            const chunkText = chunk.text;
            if (chunkText) {
                responseText += chunkText;
                onChunk(chunkText);
            }
            
            // Capture Google Search Grounding Metadata
            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata?.groundingChunks) {
                groundingMetadata.groundingChunks.forEach((chunk: any) => {
                    if (chunk.web) {
                        collectedGroundingChunks.push({
                            title: chunk.web.title,
                            uri: chunk.web.uri
                        });
                    }
                });
            }
        }
        
        const geminiData = parseGeminiResponse(responseText);

        if (!geminiData.posts || !Array.isArray(geminiData.posts) || geminiData.posts.length === 0) {
            throw new Error("AI 응답 형식이 올바르지 않습니다. (게시물 목록 누락/형식 오류)");
        }
        
        // This mapping and processing logic is moved from the original geminiService function
        let postsData: Post[] = geminiData.posts.slice(0, NUMBER_OF_POSTS).map((geminiPost: GeminiPostContent, postIndex: number) => {
            const isBest = postIndex === 0;
            const postId = `post-${Date.now()}-${postIndex}`;
            const postAuthor = geminiPost.author || `익명_${postIndex + 1}`;
            const postTimestamp = getDetailedTimestamp((Math.random() * 1000 * 60 * 60 * (postIndex + 1)) + (Math.random() * 1000 * 60 * 30));

            const minCommentsForThisPost = isBest ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST;
            const maxCommentsForThisPost = isBest ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST;

            let aiProvidedComments: GeminiCommentContent[] = (geminiPost.comments || []);
            let finalPostComments: Comment[] = [];

            aiProvidedComments.slice(0, maxCommentsForThisPost).forEach((aiComment, index) => {
                const commentId = `comment-${postId}-${index}-${Date.now()}`;
                const processedCommentAuthor = ensureUniqueCommentAuthor(aiComment.author, postAuthor, index);

                finalPostComments.push({
                    id: commentId, author: processedCommentAuthor, text: aiComment.text || "흠...",
                    timestamp: getCurrentTimestamp(), // AI comments generated "now" relatively
                    recommendations: Math.floor(Math.random() * (isBest ? 50 : 15)),
                    nonRecommendations: Math.floor(Math.random() * (isBest ? 5 : 5)),
                });
            });

            while (finalPostComments.length < minCommentsForThisPost) {
                const idx = finalPostComments.length;
                finalPostComments.push({
                    id: `comment-fallback-${postId}-${idx}-${Date.now()}`, author: `자동댓글러${idx + 1}`, text: isBest ? "이것이 개념글의 품격인가!" : "재미있네요!",
                    timestamp: getCurrentTimestamp(),
                    recommendations: Math.floor(Math.random() * (isBest ? 10 : 5)), nonRecommendations: Math.floor(Math.random() * 2),
                });
            }

            return {
                id: postId, isBestPost: isBest, title: geminiPost.title || `"${params.topic}" 주제 포스트 #${postIndex + 1}${isBest ? " (🔥인기글🔥)" : ""}`,
                author: postAuthor, timestamp: postTimestamp, content: (geminiPost.content || "이 게시물에는 아직 내용이 없습니다."),
                views: isBest ? Math.floor(Math.random() * 15000) + 5000 : Math.floor(Math.random() * 2000) + 50,
                recommendations: isBest ? Math.floor(Math.random() * 500) + 200 : Math.floor(Math.random() * 49) + 0,
                nonRecommendations: isBest ? Math.floor(Math.random() * 30) + 5 : Math.floor(Math.random() * 20) + 0,
                comments: finalPostComments,
            };
        });

        while (postsData.length < NUMBER_OF_POSTS) {
            const postIndex = postsData.length;
            const postId = `post-fallback-${Date.now()}-${postIndex}`;
            const isCurrentPostBest = (postIndex === 0 && postsData.length === 0);
            postsData.push({
                id: postId, isBestPost: isCurrentPostBest, title: `"${params.topic}"에 대한 추가 게시물 #${postIndex + 1} (AI 생성 부족)${isCurrentPostBest ? " (🔥인기글🔥)" : ""}`,
                author: `관리자봇${postIndex + 1}`, timestamp: getDetailedTimestamp(Math.random() * 1000 * 60 * 60 * (postIndex + 1)),
                content: "AI가 요청한 만큼의 게시물을 생성하지 못했습니다. 이 게시물은 자리 채우기용입니다.",
                views: isCurrentPostBest ? Math.floor(Math.random() * 1500) + 500 : Math.floor(Math.random() * 50) + 10,
                recommendations: isCurrentPostBest ? Math.floor(Math.random() * 50) + 20 : Math.floor(Math.random() * 10),
                nonRecommendations: isCurrentPostBest ? Math.floor(Math.random() * 5) : Math.floor(Math.random() * 3),
                comments: Array.from({ length: isCurrentPostBest ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST }).map((_, cIdx) => ({
                    id: `comment-fallback-${postId}-${cIdx}-${Date.now()}`, author: "시스템", text: "이 게시물은 자동으로 생성된 게시물의 자동 댓글입니다.",
                    timestamp: getCurrentTimestamp(), recommendations: 0, nonRecommendations: 0,
                })),
            });
        }
        postsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Deduplicate sources based on URI
        const uniqueSources = collectedGroundingChunks.filter((v, i, a) => a.findIndex(t => (t.uri === v.uri)) === i);

        return { 
            galleryTitle: geminiData.galleryTitle, 
            posts: postsData,
            sources: uniqueSources 
        };
    } catch (error) {
        if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
            throw error;
        }
        console.error("Error in createGalleryStreamed:", error);
        if (error instanceof Error && (error.message.includes("AI 응답") || error.message.includes("파싱에 실패했습니다") || error.message.includes("형식이 아닙니다"))) throw error;
        throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 서비스 접속 또는 데이터 파싱 오류)`);
    }
};


export interface NewPostData {
    title: string;
    author: string;
    content: string;
}

export const addUserPost = async (
    newPostData: NewPostData,
    galleryContext: GalleryContextParams,
    selectedModel: string
): Promise<Post> => {
    const newUserPostId = `user-post-${Date.now()}`;

    const evaluationMetrics = await evaluateUserPostContent(
        newPostData,
        galleryContext,
        selectedModel
    );

    const isNewUserPostBest = evaluationMetrics.suggestedRecommendations >= 50;
    const minUserComments = isNewUserPostBest ? MIN_COMMENTS_PER_BEST_POST : MIN_COMMENTS_PER_POST;
    const maxUserComments = isNewUserPostBest ? MAX_COMMENTS_PER_BEST_POST : MAX_COMMENTS_PER_POST;

    const aiGeneratedComments = await generateCommentsForUserPost(
        newPostData,
        galleryContext, minUserComments, maxUserComments,
        selectedModel
    );

    const processedComments: Comment[] = aiGeneratedComments.map((comment, index) => ({
        id: `comment-${newUserPostId}-${index}-${Date.now()}`,
        author: comment.author === newPostData.author ? `${POST_AUTHOR_PREFIX}${comment.author}` : comment.author,
        text: comment.text,
        timestamp: getCurrentTimestamp(),
        recommendations: Math.floor(Math.random() * (isNewUserPostBest ? 25 : 15)),
        nonRecommendations: Math.floor(Math.random() * (isNewUserPostBest ? 8 : 5)),
    }));

    const finalNewPost: Post = {
        id: newUserPostId,
        title: newPostData.title,
        author: newPostData.author,
        content: newPostData.content,
        timestamp: getDetailedTimestamp(),
        views: evaluationMetrics.suggestedViews,
        recommendations: evaluationMetrics.suggestedRecommendations,
        nonRecommendations: evaluationMetrics.suggestedNonRecommendations,
        isBestPost: isNewUserPostBest,
        comments: processedComments,
    };

    return finalNewPost;
};

export const addFollowUpComments = async (
    targetPost: Post,
    updatedComments: Comment[],
    galleryContext: GalleryContextParams,
    selectedModel: string
): Promise<Comment[]> => {
    const aiFollowUpComments = await generateFollowUpCommentsForPost(
        targetPost,
        updatedComments,
        galleryContext,
        MIN_AI_FOLLOW_UP_COMMENTS,
        MAX_AI_FOLLOW_UP_COMMENTS,
        selectedModel
    );

    return aiFollowUpComments.map((comment, index) => {
        const baseTargetPostAuthor = targetPost.author.startsWith(POST_AUTHOR_PREFIX) ? targetPost.author.substring(POST_AUTHOR_PREFIX.length) : targetPost.author;
        const finalAIFollowUpAuthor = comment.author === baseTargetPostAuthor ? `${POST_AUTHOR_PREFIX}${comment.author}` : comment.author;
        const aiCommentId = `ai-followup-comment-${targetPost.id}-${index}-${Date.now()}`;
        return {
            id: aiCommentId,
            author: finalAIFollowUpAuthor,
            text: comment.text,
            timestamp: getCurrentTimestamp(),
            recommendations: Math.floor(Math.random() * 10),
            nonRecommendations: Math.floor(Math.random() * 3),
        };
    });
};

export const getWorldviewFeedback = async (
    customWorldviewText: string,
    galleryData: GalleryData,
    selectedModel: string
): Promise<string> => {
    try {
        const feedback = await generateWorldviewFeedback(
            customWorldviewText,
            galleryData,
            selectedModel
        );
        return feedback;
    } catch (error) {
        if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
            throw error;
        }
        console.error("Error in getWorldviewFeedback:", error);
        if (error instanceof Error && (error.message.includes("AI 응답") || error.message.includes("파싱에 실패했습니다"))) throw error;
        throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 피드백 생성 서비스 접속 오류)`);
    }
};