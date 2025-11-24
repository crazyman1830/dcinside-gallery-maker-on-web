import React from 'react';

interface ErrorMessageProps {
  message: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  return (
    <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center" role="alert">
      <strong className="font-bold"><i className="fas fa-exclamation-triangle mr-2"></i>오류:</strong>
      <span className="block sm:inline ml-2">{message}</span>
    </div>
  );
};