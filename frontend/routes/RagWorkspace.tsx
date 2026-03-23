import React, { useState } from 'react';
import RagManager from '../components/RagManager';
import { Link } from 'react-router-dom';

const RagWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'documents' | 'search'>('documents');

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Knowledge Workspace</p>
            <h1 className="text-2xl font-bold text-gray-900">Growth Desk 知識工作空間</h1>
            <p className="text-sm text-gray-500">串連文件、SOP、FAQ，讓 Copilot 與搜尋即時取用。</p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← 回到 Copilot Console
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="flex border-b border-gray-200">
            <button
              className={`flex-1 py-3 text-sm font-medium ${
                activeTab === 'documents' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('documents')}
            >
              文件庫
            </button>
            <button
              className={`flex-1 py-3 text-sm font-medium ${
                activeTab === 'search' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('search')}
            >
              語意搜尋
            </button>
          </div>

          <div className="p-6">
            <RagManager mode={activeTab} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default RagWorkspace;
