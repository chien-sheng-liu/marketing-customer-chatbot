import React, { useEffect, useRef, useState } from 'react';
import {
  RagDocumentSummary,
  RagSearchMatch,
  deleteRagDocument,
  downloadRagDocument,
  listRagDocuments,
  searchRag,
  uploadRagDocument
} from '../services/apiClient';
import { DownloadIcon, FileIcon, SearchIcon, TrashIcon, UploadIcon } from './Icons';

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-TW', { hour: '2-digit', minute: '2-digit' });
};

const formatSize = (bytes: number) => {
  if (bytes > 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes > 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};

interface RagManagerProps {
  mode?: 'documents' | 'search';
}

const RagManager: React.FC<RagManagerProps> = ({ mode = 'documents' }) => {
  const [documents, setDocuments] = useState<RagDocumentSummary[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RagSearchMatch[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    try {
      const data = await listRagDocuments();
      setDocuments(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '載入文件列表失敗';
      setError(message);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadRagDocument(file);
      await loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : '上傳失敗，請稍後再試';
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = async (doc: RagDocumentSummary) => {
    const confirmed = window.confirm(`確定要刪除「${doc.originalName}」嗎？`);
    if (!confirmed) return;
    setError(null);
    try {
      await deleteRagDocument(doc.id);
      await loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : '刪除失敗';
      setError(message);
    }
  };

  const handleDownload = async (doc: RagDocumentSummary) => {
    setError(null);
    try {
      const blob = await downloadRagDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = doc.originalName || 'document.txt';
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : '下載失敗';
      setError(message);
    }
  };

  const handleSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const matches = await searchRag(query.trim(), 5);
      setSearchResults(matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : '搜尋失敗';
      setError(message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={mode === 'search' ? 'bg-white rounded-xl shadow-sm border border-gray-200' : 'bg-white rounded-xl p-5 shadow-sm border border-gray-200'}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Knowledge Assets</h3>
          <p className="text-xs text-gray-400">即時把 SOP / FAQ 變成 Copilot 可用的知識資產</p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          disabled={uploading}
        >
          <UploadIcon />
          {uploading ? '上傳中...' : '新增文件'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.pdf,.docx,.xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500 mb-3">{error}</p>
      )}

      {mode === 'documents' && (
        <>
          <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-3 bg-gray-50">
            {documents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center">尚無品牌文件，立即建立第一個知識節點。</p>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-600"><FileIcon /></span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{doc.originalName}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(doc.createdAt)} ・ {doc.numChunks} chunks ・ {formatSize(doc.fileSize)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="p-2 rounded-full text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                      aria-label="下載"
                    >
                      <DownloadIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      className="p-2 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50"
                      aria-label="刪除"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSearch} className="mt-4 flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <SearchIcon />
              <input
                type="text"
                className="flex-1 text-sm outline-none"
                placeholder="輸入 SOP 關鍵字，啟動語意搜尋..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70"
              disabled={!query.trim() || isSearching}
            >
              {isSearching ? '搜尋中...' : '語意搜尋'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs uppercase text-gray-500 tracking-widest">相關片段</p>
              {searchResults.map((match) => (
                <div key={`${match.docId}-${match.score}`} className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                    <span className="font-medium text-gray-800">{match.filename}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">相似度 {match.score.toFixed(3)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{match.snippet}</p>
                </div>
              ))}
            </div>
          )}

        </>
      )}

      {mode === 'search' && (
        <div className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <SearchIcon />
              <input
                type="text"
                className="flex-1 text-sm outline-none"
                placeholder="輸入 SOP 關鍵字，啟動語意搜尋..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70"
              disabled={!query.trim() || isSearching}
            >
              {isSearching ? '搜尋中...' : '語意搜尋'}
            </button>
          </form>

          <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 text-sm text-gray-600">
            目前 {documents.length} 份文件可供 Copilot 檢索，輸入問題即可依語意相似度排序。
          </div>

          {searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map((match) => (
                <div key={`${match.docId}-${match.score}`} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{match.filename}</p>
                      <p className="text-xs text-gray-500">相似度 {match.score.toFixed(4)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const result = documents.find((doc) => doc.id === match.docId);
                        if (result) {
                          handleDownload(result);
                        }
                      }}
                      className="text-xs px-3 py-1 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50"
                    >
                      下載檔案
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{match.snippet}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center">尚未搜尋或無符合結果</p>
          )}
        </div>
      )}
    </div>
  );
};

export default RagManager;
