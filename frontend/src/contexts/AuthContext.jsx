import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, setAccessToken, unwrap } from '../lib/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const res = await apiClient.post('/auth/session', {});
      const data = unwrap(res);
      if (data?.accessToken && data?.user) {
        setAccessToken(data.accessToken);
        setUser(data.user);
        return data.user;
      }
      setAccessToken(null);
      setUser(null);
      return null;
    } catch {
      setAccessToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const loginWithEmail = useCallback(async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    const data = unwrap(res);
    if (data?.accessToken && data?.user) {
      setAccessToken(data.accessToken);
      setUser(data.user);
      return { user: data.user, session: data.user };
    }
    throw new Error('Login failed');
  }, []);

  const registerWithEmail = useCallback(async (email, password, options = {}) => {
    const roleUpper = (options.role || 'STUDENT').toUpperCase();
    const payload = {
      email,
      password,
      role: roleUpper,
      fullName: options.fullName || options.name || email.split('@')[0],
      companyName: options.companyName || (roleUpper === 'EMPLOYER' ? 'Company' : undefined),
    };
    const res = await apiClient.post('/auth/register', payload);
    const data = unwrap(res);
    if (data?.accessToken && data?.user) {
      setAccessToken(data.accessToken);
      setUser(data.user);
      return { user: data.user, session: data.user };
    }
    throw new Error('Registration failed');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      /* ignore */
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    return fetchSession();
  }, [fetchSession]);

  // Compatibility stubs for UI elements that reference phone/Google auth
  const loginWithGoogle = useCallback(async () => {
    throw new Error('Google Sign-In is not configured for this environment. Please sign in with email and password.');
  }, []);

  const resetPassword = useCallback(async () => {
    throw new Error('Password reset emails are disabled in local development. Contact admin or use reset script.');
  }, []);

  const setupRecaptcha = useCallback(() => null, []);
  const requestPhoneOtp = useCallback(async () => {
    throw new Error('SMS authentication is disabled. Please use email and password.');
  }, []);
  const verifyPhoneOtp = useCallback(async () => {
    throw new Error('SMS authentication is disabled.');
  }, []);

  const role = (user?.role || '').toLowerCase();
  const isOnboarded = Boolean(user && user.role);

  const value = {
    user,
    firebaseUser: user, // Alias for legacy component compatibility
    session: user,
    loading,
    role: role || null,
    isOnboarded,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    resetPassword,
    setupRecaptcha,
    requestPhoneOtp,
    verifyPhoneOtp,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
