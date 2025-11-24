import React from 'react';

interface LoadingSpinnerProps {
  small?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ small = false }) => {
  const sizeClasses = small ? 'w-5 h-5 border-2' : 'w-12 h-12 border-4';
  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className={`animate-spin rounded-full ${sizeClasses} border-blue-500 border-t-transparent`}
      ></div>
      {!small && <p className="mt-2 text-gray-600">로딩 중...</p>}
    </div>
  );
};