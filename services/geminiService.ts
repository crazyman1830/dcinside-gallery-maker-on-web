
import { GoogleGenAI, GenerateContentResponse, Type, Schema } from "@google/genai";
import { GeminiCommentContent, GeminiEvaluationResponse, Post, Comment, GalleryData, UserProfile } from '../types';
import {
    GEMINI_MODEL_TEXT, DEFAULT_ERROR_MESSAGE, GEMINI_MODEL_PRO, GEMINI_MODEL_3_PRO
} from '../constants';
import { buildGalleryGenerationPrompt } from './prompts/gallery';
import { buildCommentGenerationPrompt, buildFollowUpCommentPrompt } from './prompts/comments';
import { buildPostEvaluationPrompt, buildWorldviewFeedbackPrompt } from './prompts/evaluation';
import { buildSystemInstruction } from './prompts/system';
import {
    parseGeminiCommentArrayResponse,
    parseGeminiEvaluationResponse
} from '../utils/jsonParser';
import { PromptContext } from "./prompts/context";

// API Key must be accessed via process.env.API_KEY
const API_KEY = process.env.API_KEY;

export const isApiKeyAvailable = !!API_KEY;

export const API_KEY_MISSING_ERROR_MESSAGE = "API_KEY가 설정되지 않았습니다. 애플리케이션 기능이 제한됩니다. 환경 변수 설정을 확인해주세요.";

// Helper to create a fresh instance for every call to ensure latest config/key usage
function createAiInstance(): GoogleGenAI {
  if (!API_KEY) {
    throw new Error(API_KEY_MISSING_ERROR_MESSAGE);
  }
  return new GoogleGenAI({ apiKey: API_KEY });
}

// --- Schemas for Structured Output ---

const commentSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        author: { type: Type.STRING, description: "The nickname of the commenter." },
        text: { type: Type.STRING, description: "The content of the comment. May include DC-con descriptions." }
    },
    required: ["author", "text"]
};

const postSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "Title of the post." },
        author: { type: Type.STRING, description: "Nickname of the post author." },
        content: { type: Type.STRING, description: "Body content of the post. May include Image/Video descriptions." },
        comments: { type: Type.ARRAY, items: commentSchema, description: "List of comments on this post." }
    },
    required: ["title", "author", "content", "comments"]
};

const galleryResponseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        galleryTitle: { type: Type.STRING, description: "The creative title of the generated gallery." },
        posts: { type: Type.ARRAY, items: postSchema, description: "List of posts in the gallery." }
    },
    required: ["galleryTitle", "posts"]
};

const evaluationSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        suggestedViews: { type: Type.INTEGER },
        suggestedRecommendations: { type: Type.INTEGER },
        suggestedNonRecommendations: { type: Type.INTEGER }
    },
    required: ["suggestedViews", "suggestedRecommendations", "suggestedNonRecommendations"]
};


export const generateGalleryStreamFromGemini = async (
    topic: string,
    discussionContext: string,
    worldviewValue: string,
    customWorldviewText: string | undefined,
    worldviewEraValue: string,
    toxicityLevelValue: string,
    anonymousNickRatioValue: string,
    userSpecies: string,
    userAffiliation: string,
    genderRatioValue: string,
    ageRangeValue: string | string[],
    modelName: string = GEMINI_MODEL_TEXT,
    useSearch: boolean = false,
    userProfile?: UserProfile
) => {
  const ai = createAiInstance();
  
  // Construct the Context Object
  const galleryContext: PromptContext = {
      topic, discussionContext, worldviewValue, customWorldviewText, worldviewEraValue,
      toxicityLevelValue, anonymousNickRatioValue, userSpecies, userAffiliation,
      genderRatioValue, ageRangeValue, useSearch, userProfile
  };

  const systemInstruction = buildSystemInstruction(topic, galleryContext);

  // Use the context object for the builder function
  const { prompt } = buildGalleryGenerationPrompt(galleryContext);

  const config: any = {
    // Removed explicit temperature to allow model default (1.0)
    systemInstruction: systemInstruction,
  };

  // Thinking Config for supported models (Pro series generally)
  if (modelName.includes('thinking') || modelName === GEMINI_MODEL_3_PRO || modelName === GEMINI_MODEL_PRO) {
        config.thinkingConfig = { thinkingBudget: 2048 }; 
  }

  // If search is enabled, we rely on the Prompt to enforce JSON because responseSchema + Tools can be restrictive
  if (useSearch) {
    config.tools = [{ googleSearch: {} }];
    config.responseMimeType = "application/json";
  } else {
    // When NOT using search, use Strict Schema for perfect JSON
    config.responseMimeType = "application/json";
    config.responseSchema = galleryResponseSchema;
  }

  try {
    return await ai.models.generateContentStream({
      model: modelName,
      contents: prompt,
      config: config,
    });
  } catch (error) {
    if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
      throw error;
    }
    console.error("Error calling Gemini API Stream in generateGalleryStreamFromGemini:", error);
    throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 서비스 접속 오류)`);
  }
};

export const generateCommentsForUserPost = async (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext,
    minComments: number, maxComments: number,
    modelName: string = GEMINI_MODEL_TEXT
): Promise<GeminiCommentContent[]> => {
    const ai = createAiInstance();
    const systemInstruction = buildSystemInstruction(galleryContext.topic, galleryContext);
    
    const { prompt, numberOfCommentsToGenerate } = buildCommentGenerationPrompt(
        userPost, galleryContext, minComments, maxComments
    );

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { 
                responseMimeType: "application/json", 
                systemInstruction: systemInstruction 
            },
        });
        
        const geminiComments = parseGeminiCommentArrayResponse(response.text);

        if (geminiComments.length < minComments) console.warn(`AI generated ${geminiComments.length} comments for user post, less than min ${minComments}. Requested ${numberOfCommentsToGenerate}.`);
        return geminiComments.slice(0, Math.min(numberOfCommentsToGenerate, maxComments));
    } catch (error) {
        if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
            throw error;
        }
        console.error("Error generating comments for user post:", error);
        throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 댓글 생성 서비스 접속 또는 데이터 파싱 오류)`);
    }
};

export const generateFollowUpCommentsForPost = async (
    originalPost: Pick<Post, 'title' | 'author' | 'content'>,
    existingComments: Comment[],
    galleryContext: PromptContext,
    minCommentsToGenerate: number, maxCommentsToGenerate: number,
    modelName: string = GEMINI_MODEL_TEXT
): Promise<GeminiCommentContent[]> => {
    const ai = createAiInstance();
    const systemInstruction = buildSystemInstruction(galleryContext.topic, galleryContext);

    const { prompt, numberOfCommentsToGenerate } = buildFollowUpCommentPrompt(
        originalPost, existingComments, galleryContext, minCommentsToGenerate, maxCommentsToGenerate
    );

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                systemInstruction: systemInstruction 
            },
        });
        
        const geminiComments = parseGeminiCommentArrayResponse(response.text);

        if (geminiComments.length < minCommentsToGenerate) console.warn(`AI generated ${geminiComments.length} follow-up comments, less than min ${minCommentsToGenerate}. Requested ${numberOfCommentsToGenerate}.`);
        return geminiComments.slice(0, Math.min(numberOfCommentsToGenerate, maxCommentsToGenerate));
    } catch (error) {
        if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
            throw error;
        }
        console.error("Error generating follow-up comments:", error);
        throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 후속 댓글 생성 서비스 접속 또는 데이터 파싱 오류)`);
    }
};

export const evaluateUserPostContent = async (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext,
    modelName: string = GEMINI_MODEL_TEXT
): Promise<GeminiEvaluationResponse> => {
    const ai = createAiInstance();
    const systemInstruction = buildSystemInstruction(galleryContext.topic, galleryContext);

    const { prompt } = buildPostEvaluationPrompt(userPost, galleryContext);

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { 
                responseMimeType: "application/json", 
                responseSchema: evaluationSchema,
                systemInstruction: systemInstruction,
            },
        });
        
        try {
            return JSON.parse(response.text || "{}");
        } catch {
            return parseGeminiEvaluationResponse(response.text);
        }
    } catch (error) {
        if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
            throw error;
        }
        console.error("Error evaluating user post content:", error);
        throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 게시물 평가 서비스 접속 또는 데이터 파싱 오류)`);
    }
};

export const generateWorldviewFeedback = async (
    customWorldviewText: string,
    galleryData: GalleryData,
    modelName: string = GEMINI_MODEL_TEXT
): Promise<string> => {
    const ai = createAiInstance();
    const { prompt } = buildWorldviewFeedbackPrompt(customWorldviewText, galleryData);

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            // Removed temperature setting to rely on model default (Gemini 3 optimal: 1.0)
        });
        return response.text || "피드백을 생성할 수 없습니다.";
    } catch (error) {
        if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
            throw error;
        }
        console.error("Error calling Gemini API in generateWorldviewFeedback:", error);
        throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 피드백 생성 서비스 접속 오류)`);
    }
};

export const generateImageFromGemini = async (
    description: string
): Promise<string> => {
    const ai = createAiInstance();

    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: description,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '1:1',
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
        throw new Error("이미지 생성 결과가 없습니다.");
    } catch (error) {
        if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
            throw error;
        }
        console.error("Error calling Gemini API in generateImageFromGemini:", error);
        throw new Error(`${DEFAULT_ERROR_MESSAGE} (AI 이미지 생성 오류)`);
    }
};
