
import { GeminiResponseData, GeminiCommentContent, GeminiEvaluationResponse } from '../types';

/**
 * Extracts JSON string from a larger text response.
 * Handles Markdown code blocks, raw JSON with surrounding text, and attempts to find the valid JSON structure.
 */
function extractJsonString(text: string): string {
    let jsonStr = text.trim();

    // 1. Try extracting from Markdown Code Blocks first
    // Matches ```json ... ``` or just ``` ... ```
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = jsonStr.match(fenceRegex);
    if (match && match[1]) {
        jsonStr = match[1].trim();
    }

    // 2. Fallback: Heuristic extraction for raw JSON (finding outer braces/brackets)
    // This helps when the model forgets markdown fences but outputs valid JSON with preamble/postscript.
    // Also runs on the extracted block to ensure no leading/trailing whitespace garbage
    const firstOpenBrace = jsonStr.indexOf('{');
    const firstOpenBracket = jsonStr.indexOf('[');

    let startIndex = -1;
    let isObject = false;

    // Determine if we are looking for an object or an array based on which comes first
    if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
        startIndex = firstOpenBrace;
        isObject = true;
    } else if (firstOpenBracket !== -1) {
        startIndex = firstOpenBracket;
        isObject = false;
    }

    if (startIndex !== -1) {
        // Find the corresponding closing character
        // We search from the end to capture the largest possible JSON block
        const lastIndex = isObject ? jsonStr.lastIndexOf('}') : jsonStr.lastIndexOf(']');
        if (lastIndex > startIndex) {
            jsonStr = jsonStr.substring(startIndex, lastIndex + 1);
        }
    }

    // 3. Remove potential JS-style comments (// ...) which standard JSON.parse doesn't support
    // Be careful not to remove http://
    // Regex: Match // not preceded by :
    jsonStr = jsonStr.replace(/(?<!:)\/\/.*$/gm, "");

    return jsonStr;
}

export function parseProtectedJson<T>(
  responseText: string,
  typeGuard: (parsed: any) => parsed is T,
  errorContextName: string
): T {
  const jsonStr = extractJsonString(responseText);
  
  try {
    const parsed = JSON.parse(jsonStr);
    // If strict typeGuard passes, return immediately
    if (typeGuard(parsed)) {
      return parsed;
    }
    
    // Log for debugging (but throw friendly error)
    console.warn(`Type guard failed for ${errorContextName}. Parsed object structure mismatch.`);
    throw new Error(`AI 응답이 기대하는 ${errorContextName} 데이터 구조와 일치하지 않습니다.`);
  } catch (e) {
    console.error(`Failed to parse JSON ${errorContextName} response from Gemini:`, jsonStr, e);
    const errorMessage = e instanceof Error ? e.message : "알 수 없는 파싱 오류";
    
    // If it's already our custom error, rethrow
    if (errorMessage.includes("AI 응답이 기대하는")) {
        throw e;
    }
    
    throw new Error(`AI ${errorContextName} 응답 JSON 파싱에 실패했습니다. (문법 오류 또는 불완전한 데이터)`);
  }
}

export function isGeminiResponseData(parsed: any): parsed is GeminiResponseData {
  return parsed && typeof parsed.galleryTitle === 'string' && Array.isArray(parsed.posts);
}

export function isGeminiCommentContentArray(parsed: any): parsed is GeminiCommentContent[] {
  return Array.isArray(parsed) && (parsed.length === 0 ||
    (parsed[0] &&
     typeof parsed[0].author === 'string' &&
     typeof parsed[0].text === 'string'
    )
  );
}

export function isGeminiEvaluationResponse(parsed: any): parsed is GeminiEvaluationResponse {
  return parsed &&
    typeof parsed.suggestedViews === 'number' &&
    typeof parsed.suggestedRecommendations === 'number' &&
    typeof parsed.suggestedNonRecommendations === 'number';
}

export function parseGeminiResponse(responseText: string): GeminiResponseData {
  return parseProtectedJson(responseText, isGeminiResponseData, "갤러리 데이터");
}

export function parseGeminiCommentArrayResponse(responseText: string): GeminiCommentContent[] {
  // We allow ANY valid JSON object/array initially, then process it deeply.
  const raw = parseProtectedJson(responseText, (obj): obj is any => true, "댓글 배열");

  let arrayToProcess: any[] = [];

  // Case 1: It's already an array
  if (Array.isArray(raw)) {
    arrayToProcess = raw;
  } 
  // Case 2: It's an object wrapping the array (e.g. { "comments": [...] } or { "replies": [...] })
  else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.comments)) {
        arrayToProcess = raw.comments;
    } else if (Array.isArray(raw.replies)) {
        arrayToProcess = raw.replies;
    } else {
        // Fallback: search for ANY array property
        const keys = Object.keys(raw);
        for (const key of keys) {
            if (Array.isArray(raw[key])) {
                arrayToProcess = raw[key];
                break;
            }
        }
    }
  }

  if (!Array.isArray(arrayToProcess)) {
      console.warn("AI response for comments was not an array and did not contain a recognizable array.", raw);
      return [];
  }

  // Normalize and Validate items
  const normalizedComments: GeminiCommentContent[] = arrayToProcess.map((item: any) => {
    if (!item || typeof item !== 'object') return null;

    // Robust mapping for various key hallucinations
    const author = item.author || item.nickname || item.user || item.username || "익명";
    const text = item.text || item.content || item.comment || item.message || "";

    // Valid comment must have text
    if (!text && typeof text !== 'string') {
       return null;
    }

    return {
      author: String(author),
      text: String(text)
    };
  }).filter((item): item is GeminiCommentContent => item !== null);

  return normalizedComments;
}

export function parseGeminiEvaluationResponse(responseText: string): GeminiEvaluationResponse {
  return parseProtectedJson(responseText, isGeminiEvaluationResponse, "평가 지표");
}
