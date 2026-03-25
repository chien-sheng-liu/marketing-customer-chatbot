import React, { useEffect, useState } from 'react';
import {
  createUser,
  listUsers,
  resetUserPassword,
  updateUser,
  UserDTO,
} from '../../services/apiClient';

type Modal =
  | { type: 'create' }
  | { type: 'edit'; user: UserDTO }
  | { type: 'reset-password'; user: UserDTO }
  | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RoleBadge = ({ role }: { role: string }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      role === 'admin'
        ? 'bg-purple-100 text-purple-700'
        : 'bg-blue-100 text-blue-700'
    }`}
  >
    {role === 'admin' ? '管理員' : '客服專員'}
  </span>
);

const StatusBadge = ({ active }: { active: boolean }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}
  >
    {active ? '啟用' : '停用'}
  </span>
);

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

function UserFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: UserDTO;
  onSave: (data: { name: string; email: string; password?: string; role: 'admin' | 'agent' }) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'agent'>(initial?.role ?? 'agent');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSave({ name, email, password: password || undefined, role });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-5">
          {isEdit ? '編輯帳號' : '新增帳號'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密碼（至少 8 碼）</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'agent')}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="agent">客服專員</option>
              <option value="admin">管理員</option>
            </select>
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? '儲存中...' : '儲存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset password modal
// ---------------------------------------------------------------------------

function ResetPasswordModal({
  user,
  onClose,
}: {
  user: UserDTO;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetUserPassword(user.id, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">重設密碼</h2>
        <p className="text-sm text-gray-500 mb-5">{user.name}（{user.email}）</p>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">密碼已重設成功</p>
            <button onClick={onClose} className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium">
              關閉
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新密碼（至少 8 碼）</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? '儲存中...' : '確認重設'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function UserManagement() {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async (data: { name: string; email: string; password?: string; role: 'admin' | 'agent' }) => {
    await createUser({ email: data.email, name: data.name, password: data.password!, role: data.role });
    await refresh();
  };

  const handleEdit = async (user: UserDTO, data: { name: string; role: 'admin' | 'agent' }) => {
    await updateUser(user.id, { name: data.name, role: data.role });
    await refresh();
  };

  const handleToggleActive = async (user: UserDTO) => {
    await updateUser(user.id, { is_active: !user.isActive });
    await refresh();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">帳號管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理客服系統的使用者帳號與權限</p>
        </div>
        <button
          onClick={() => setModal({ type: 'create' })}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + 新增帳號
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">載入中...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-600">姓名 / 電子郵件</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">角色</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">狀態</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">建立時間</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800">{user.name}</p>
                    <p className="text-gray-400 text-xs">{user.email}</p>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3"><StatusBadge active={user.isActive} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(user.createdAt).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setModal({ type: 'edit', user })}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => setModal({ type: 'reset-password', user })}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        重設密碼
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`text-xs hover:underline ${user.isActive ? 'text-red-500' : 'text-green-600'}`}
                      >
                        {user.isActive ? '停用' : '啟用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">尚無帳號</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'create' && (
        <UserFormModal onSave={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit' && (
        <UserFormModal
          initial={modal.user}
          onSave={(data) => handleEdit(modal.user, { name: data.name, role: data.role as 'admin' | 'agent' })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'reset-password' && (
        <ResetPasswordModal user={modal.user} onClose={() => { setModal(null); }} />
      )}
    </div>
  );
}
