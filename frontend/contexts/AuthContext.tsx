import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService, AuthUser } from '../services/authService';
import { tokenStore } from '../services/tokenStore';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: try to restore session via refresh cookie
  useEffect(() => {
    authService.refresh()
      .then((data) => { if (data) setUser(data.user); })
      .finally(() => setIsLoading(false));
  }, []);

  // Auto-refresh access token 1 minute before it expires (every 14 minutes)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const data = await authService.refresh();
      if (!data) setUser(null);
    }, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authService.login(email, password);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    tokenStore.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin: user?.role === 'admin', login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
