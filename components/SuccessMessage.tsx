import React from 'react';

interface SuccessMessageProps {
  message: string;
}

export const SuccessMessage: React.FC<SuccessMessageProps> = ({ message }) => {
  return (
    <div className="my-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg text-center" role="alert">
      <strong className="font-bold"><i className="fas fa-check-circle mr-2"></i>성공:</strong>
      <span className="block sm:inline ml-2">{message}</span>
    </div>
  );
};