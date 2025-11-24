
import { GeminiResponseData, GeminiCommentContent, GeminiEvaluationResponse } from '../types';

export function parseProtectedJson<T>(
  responseText: string,
  typeGuard: (parsed: any) => parsed is T,
  errorContextName: string
): T {
  let jsonStr = responseText.trim();
  // Remove markdown code fences if present
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    // If strict typeGuard passes, return immediately
    if (typeGuard(parsed)) {
      return parsed;
    }
    
    throw new Error(`AI 응답이 기대하는 ${errorContextName} JSON 형식이 아닙니다. 응답 내용: ${jsonStr.substring(0,200)}...`);
  } catch (e) {
    console.error(`Failed to parse JSON ${errorContextName} response from Gemini:`, jsonStr, e);
    const errorMessage = e instanceof Error ? e.message : "알 수 없는 파싱 오류";
    if (errorMessage.includes(`기대하는 ${errorContextName} JSON 형식이 아닙니다`)) {
        throw e;
    }
    throw new Error(`AI ${errorContextName} 응답 JSON 파싱에 실패했습니다. 오류: ${errorMessage}. 응답 시작 부분: ${jsonStr.substring(0, 150)}...`);
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
  // We use a permissive guard here to bypass strict checking in parseProtectedJson,
  // handling normalization logic manually below.
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
