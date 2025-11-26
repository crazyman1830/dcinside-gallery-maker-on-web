
import React from 'react';

interface GeneratedImageProps {
  description: string;
}

export const GeneratedImage: React.FC<GeneratedImageProps> = ({ description }) => {
  return (
    <div 
        className="my-6 p-6 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-center bg-gray-50"
    >
      <div className="mb-3 text-gray-600 font-medium">
        <i className="fas fa-image text-2xl mb-2 block text-gray-400"></i>
        <span>이미지 설명: "{description}"</span>
      </div>
      
      <p className="text-xs text-gray-400 mt-2">
          * 이미지 생성 기능은 비활성화되어 텍스트 설명으로 대체되었습니다.
      </p>
    </div>
  );
};
