import { useRef, useState } from 'react'
import './UploadPdfPage.css'

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadPdfPage() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  function handleFiles(fileList) {
    const file = fileList?.[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Upload PDF Document</h1>

      <div className="admin-card">
        <p className="upload-description">
          Upload the hotel information document that will serve as the knowledge base for
          the AI assistant. Only PDF files are accepted.
        </p>

        <div
          className={isDragging ? 'upload-dropzone upload-dropzone--active' : 'upload-dropzone'}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="upload-input"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <p className="upload-dropzone-title">Drag &amp; drop a PDF here</p>
          <p className="upload-dropzone-sub">or click to browse</p>
        </div>

        {selectedFile && (
          <div className="upload-file-row">
            <div className="upload-file-info">
              <span className="upload-file-name">{selectedFile.name}</span>
              <span className="upload-file-size">{formatFileSize(selectedFile.size)}</span>
            </div>
            <button
              type="button"
              className="upload-remove-btn"
              onClick={() => setSelectedFile(null)}
            >
              Remove
            </button>
          </div>
        )}

        <button type="button" className="upload-submit-btn" disabled={!selectedFile}>
          Upload Document
        </button>
      </div>
    </div>
  )
}

export default UploadPdfPage
