
import React, { useState } from 'react';
import { generateImageFromGemini } from '../services/geminiService';
import { LoadingSpinner } from './LoadingSpinner';

interface GeneratedImageProps {
  description: string;
}

export const GeneratedImage: React.FC<GeneratedImageProps> = ({ description }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleGenerateClick = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const generatedUrl = await generateImageFromGemini(description);
      setImageUrl(generatedUrl);
    } catch (err) {
      setError("이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  if (imageUrl) {
    return (
      <div className="my-4 relative group">
        <img 
            src={imageUrl} 
            alt={description} 
            className="w-full max-w-lg rounded-lg shadow-lg mx-auto"
            loading="lazy"
        />
        <p className="text-center text-xs text-gray-500 mt-2">
            <i className="fas fa-magic mr-1"></i>AI 생성 이미지: {description}
        </p>
      </div>
    );
  }

  return (
    <div 
        className={`my-6 p-6 border-2 border-dashed rounded-xl transition-all duration-300 flex flex-col items-center justify-center text-center bg-gray-50 ${isHovered ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
    >
      <div className="mb-3 text-gray-600 font-medium">
        <i className="fas fa-image text-2xl mb-2 block text-gray-400"></i>
        <span>이미지 설명: "{description}"</span>
      </div>
      
      {isLoading ? (
        <div className="flex flex-col items-center">
            <LoadingSpinner small={false} />
            <p className="text-sm text-blue-600 mt-2 animate-pulse">AI가 이미지를 그리고 있습니다... (약 5-10초 소요)</p>
        </div>
      ) : (
        <>
            <button 
                onClick={handleGenerateClick}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold shadow-md transition-transform transform hover:scale-105 flex items-center"
            >
                <i className="fas fa-paint-brush mr-2"></i> AI 이미지 생성하기
            </button>
            {error && <p className="text-red-500 text-sm mt-3"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
            <p className="text-xs text-gray-400 mt-3">
                * Gemini Imagen 모델을 사용하여 설명을 기반으로 이미지를 생성합니다.
            </p>
        </>
      )}
    </div>
  );
};
