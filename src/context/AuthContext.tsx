import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, getAuthToken, setAuthToken, UserProfile } from '../lib/api';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile>;
  registerWithEmail: (payload: {
    email: string;
    password: string;
    displayName?: string;
    acceptedTerms: boolean;
  }) => Promise<UserProfile>;
  loginWithGoogle: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = window.localStorage.getItem('chartledger_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      window.localStorage.setItem('chartledger_theme', theme);
    } catch {
      // ignore storage failure
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const profile = await apiFetch<UserProfile>('/api/user/profile');
      setUser(profile);
    } catch {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          setAuthToken(idToken);
          const profile = await apiFetch<UserProfile>('/api/user/profile');
          setUser(profile);
        } catch {
          setAuthToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    });

    const fallbackTimer = setTimeout(() => setLoading(false), 1200);
    return () => {
      unsub();
      clearTimeout(fallbackTimer);
    };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const registerWithEmail = useCallback(
    async (payload: {
      email: string;
      password: string;
      displayName?: string;
      acceptedTerms: boolean;
    }) => {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    setAuthToken(idToken);
    const profile = await apiFetch<UserProfile>('/api/user/profile');
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getAuthToken()) {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        theme,
        toggleTheme,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        refreshProfile,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
