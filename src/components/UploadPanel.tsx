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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    onFileSelect(files);
  };

  const getErrorMessage = () => {
    if (error) return error;
    if (!supportedTypes.length) return 'No file types supported.';
    return `Unsupported file types. Please upload one of: ${supportedTypes.join(', ')}.`;
  };

  return (
    <div
      className={`upload-panel ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        multiple
        onChange={handleChange}
        className="upload-input"
        accept={supportedTypes.length ? supportedTypes.join(',') : ''}
      />
      <div className="upload-area">
        <p className="upload-title">Drag & drop files here</p>
        <p className="upload-subtitle">or click to browse</p>
        {error && (
          <div className="error-message">
            <FaTimesCircle />
            {getErrorMessage()}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPanel;