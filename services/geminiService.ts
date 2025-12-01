
import { GoogleGenAI, GenerateContentResponse, Type, Schema } from "@google/genai";
import { GeminiCommentContent, GeminiEvaluationResponse, Post, Comment, GalleryData, UserProfile } from '../types';
import {
    GEMINI_MODEL_TEXT, DEFAULT_ERROR_MESSAGE, GEMINI_MODEL_PRO, GEMINI_MODEL_3_PRO
} from '../constants';
import { buildGalleryGenerationPrompt, GALLERY_PROMPT_VERSION } from './prompts/gallery';
import { buildCommentGenerationPrompt, buildFollowUpCommentPrompt, COMMENT_PROMPT_VERSION } from './prompts/comments';
import { buildPostEvaluationPrompt, buildWorldviewFeedbackPrompt, EVALUATION_PROMPT_VERSION } from './prompts/evaluation';
import { buildSystemInstruction, SYSTEM_INSTRUCTION_VERSION } from './prompts/system';
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

// --- Retry Logic ---
const MAX_RETRIES = 2;

async function withRetry<T>(
    operation: () => Promise<T>, 
    context: string
): Promise<T> {
    let lastError: any;
    for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (error instanceof Error && error.message === API_KEY_MISSING_ERROR_MESSAGE) {
                throw error; // Don't retry auth errors
            }
            console.warn(`Attempt ${i + 1} failed for ${context}:`, error);
            if (i < MAX_RETRIES) {
                const delay = 1000 * Math.pow(2, i); // Exponential backoff (1s, 2s)
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
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
    modelName: string = GEMINI_MODEL_3_PRO,
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
    systemInstruction: systemInstruction,
  };

  if (useSearch) {
    config.tools = [{ googleSearch: {} }];
    // Strict requirement: DO NOT set responseMimeType when using googleSearch
  } else {
    // When NOT using search, use Strict Schema for perfect JSON
    config.responseMimeType = "application/json";
    config.responseSchema = galleryResponseSchema;
  }

  // Note: We do not use withRetry for streaming response initiation here 
  // because retry logic for streams is better handled at connection level or not at all 
  // if partial data has already been emitted. The UI handles stream errors.
  try {
    console.debug(`[Gemini] Generating Gallery Stream. System v${SYSTEM_INSTRUCTION_VERSION}, Prompt v${GALLERY_PROMPT_VERSION}`);
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
    modelName: string = GEMINI_MODEL_3_PRO
): Promise<GeminiCommentContent[]> => {
    return withRetry(async () => {
        const ai = createAiInstance();
        const systemInstruction = buildSystemInstruction(galleryContext.topic, galleryContext);
        
        const { prompt, numberOfCommentsToGenerate } = buildCommentGenerationPrompt(
            userPost, galleryContext, minComments, maxComments
        );

        console.debug(`[Gemini] Generating Comments. System v${SYSTEM_INSTRUCTION_VERSION}, Prompt v${COMMENT_PROMPT_VERSION}`);
        
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
    }, "generateCommentsForUserPost");
};

export const generateFollowUpCommentsForPost = async (
    originalPost: Pick<Post, 'title' | 'author' | 'content'>,
    existingComments: Comment[],
    galleryContext: PromptContext,
    minCommentsToGenerate: number, maxCommentsToGenerate: number,
    modelName: string = GEMINI_MODEL_3_PRO
): Promise<GeminiCommentContent[]> => {
    return withRetry(async () => {
        const ai = createAiInstance();
        const systemInstruction = buildSystemInstruction(galleryContext.topic, galleryContext);

        const { prompt, numberOfCommentsToGenerate } = buildFollowUpCommentPrompt(
            originalPost, existingComments, galleryContext, minCommentsToGenerate, maxCommentsToGenerate
        );

        console.debug(`[Gemini] Generating Follow-up Comments. System v${SYSTEM_INSTRUCTION_VERSION}, Prompt v${COMMENT_PROMPT_VERSION}`);

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
    }, "generateFollowUpCommentsForPost");
};

export const evaluateUserPostContent = async (
    userPost: Pick<Post, 'title' | 'author' | 'content'>,
    galleryContext: PromptContext,
    modelName: string = GEMINI_MODEL_3_PRO
): Promise<GeminiEvaluationResponse> => {
    return withRetry(async () => {
        const ai = createAiInstance();
        const systemInstruction = buildSystemInstruction(galleryContext.topic, galleryContext);

        const { prompt } = buildPostEvaluationPrompt(userPost, galleryContext);

        console.debug(`[Gemini] Evaluating Post. System v${SYSTEM_INSTRUCTION_VERSION}, Prompt v${EVALUATION_PROMPT_VERSION}`);

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
            // Priority: response.text (might be raw JSON), but using responseSchema guarantees it.
            // We use parseGeminiEvaluationResponse to safely extract/parse.
            return parseGeminiEvaluationResponse(response.text);
        } catch {
             // Fallback usually not needed with schema, but kept for safety
            return JSON.parse(response.text || "{}");
        }
    }, "evaluateUserPostContent");
};

export const generateWorldviewFeedback = async (
    customWorldviewText: string,
    galleryData: GalleryData,
    modelName: string = GEMINI_MODEL_3_PRO
): Promise<string> => {
    return withRetry(async () => {
        const ai = createAiInstance();
        const { prompt } = buildWorldviewFeedbackPrompt(customWorldviewText, galleryData);

        console.debug(`[Gemini] Generating Feedback. Prompt v${EVALUATION_PROMPT_VERSION}`);

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
        });
        return response.text || "피드백을 생성할 수 없습니다.";
    }, "generateWorldviewFeedback");
};
