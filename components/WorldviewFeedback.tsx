import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface WorldviewFeedbackProps {
  isFetching: boolean;
  feedback: string | null;
  onFetchFeedback: () => void;
  isVisible: boolean;
}

export const WorldviewFeedback: React.FC<WorldviewFeedbackProps> = ({ isFetching, feedback, onFetchFeedback, isVisible }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="my-8 p-6 bg-white border border-gray-200 rounded-lg shadow-md">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">
        <i className="fas fa-lightbulb mr-2 text-yellow-500"></i>AI의 세계관 설정 개선 제안
      </h3>
      {isFetching ? (
        <div className="flex justify-center items-center py-4">
          <LoadingSpinner />
        </div>
      ) : feedback ? (
        <div className="prose prose-sm sm:prose-base max-w-none text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-md border">
          {feedback}
        </div>
      ) : (
        <div>
          <p className="text-gray-600 mb-4">
            생성된 갤러리 내용을 바탕으로 AI가 사용자의 '직접 입력' 세계관 설정을 더 풍부하고 일관성 있게 만들 수 있도록 피드백을 제공합니다.
          </p>
          <button
            onClick={onFetchFeedback}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 flex items-center text-sm font-medium"
          >
            <i className="fas fa-comment-dots mr-2"></i>피드백 받기
          </button>
        </div>
      )}
    </div>
  );
};
