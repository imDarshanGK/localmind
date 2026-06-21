import React, { useState } from 'react';
import { FaTimesCircle } from 'react-icons/fa';

interface UploadPanelProps {
  onFileSelect: (files: FileList | null) => void;
  onDrop: (files: FileList | null) => void;
  supportedTypes: string[];
  error: string | null;
}

const UploadPanel: React.FC<UploadPanelProps> = ({
  onFileSelect,
  onDrop,
  supportedTypes,
  error,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    onDrop(files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    onFileSelect(files);
  };

  const getErrorMessage = () => {
    if (!error) return null;
    if (error.includes('unsupported')) {
      const types = supportedTypes.join(', ');
      return `Only ${types} files are supported.`;
    }
    return error;
  };

  const errorMessage = getErrorMessage();

  return (
    <div
      className={`upload-panel border-2 rounded-lg p-4 transition-colors ${
        isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        id="file-upload"
      />
      <label
        htmlFor="file-upload"
        className="cursor-pointer flex flex-col items-center justify-center h-32"
      >
        <FaTimesCircle className="text-gray-500 mb-2" />
        <span className="text-gray-600">Drag & drop files here</span>
        <span className="text-sm text-gray-500">or click to browse</span>
      </label>

      {errorMessage && (
        <div className="mt-2 text-sm text-red-600 flex items-center">
          <FaTimesCircle className="mr-1" />
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default UploadPanel;