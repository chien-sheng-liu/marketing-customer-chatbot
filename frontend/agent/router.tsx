import React from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import App from '../App';
import RagWorkspace from '../routes/RagWorkspace';
import LoginPage from '../components/agent/LoginPage';
import UserManagement from '../components/agent/UserManagement';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

/** Redirects to /login when not authenticated. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">載入中...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Admin-only route — non-admins get redirected to home. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute><App /></ProtectedRoute>,
  },
  {
    path: '/documents',
    element: <AdminRoute><RagWorkspace /></AdminRoute>,
  },
  {
    path: '/users',
    element: <AdminRoute><UserManagement /></AdminRoute>,
  },
]);

export default function AgentRouter() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
