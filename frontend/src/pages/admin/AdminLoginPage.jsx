import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { apiClient, unwrap } from '../../lib/apiClient.js';
import toast from 'react-hot-toast';
import { Loader2, Shield, Eye, EyeOff, ArrowRight, Lock } from 'lucide-react';

export default function AdminLoginPage() {
  const { user, login, role, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  // Redirect if already admin
  useEffect(() => {
    if (!loading && user && role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [loading, user, role, navigate]);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password.');
      return;
    }

    setSigningIn(true);
    try {
      const loggedInUser = await login(email, password);
      if (loggedInUser?.role === 'admin') {
        toast.success('Welcome, Admin!');
        navigate('/admin', { replace: true });
      } else {
        toast.error('Admin access denied. Account does not have admin privileges.');
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Admin login failed. Please try again.';
      toast.error(msg);
      console.error('Admin login error:', err);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[85vh]">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="mx-auto h-16 w-16 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-soft-lg mb-4">
            <Shield className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-brand-900 mt-2 mb-1 tracking-tight">
            Admin Portal
          </h1>
          <p className="text-brand-500 text-sm">LanTURN Platform Administration</p>
        </div>

        {/* Card */}
        <div className="card p-8 animate-slide-up">
          {/* Warning badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 mb-6">
            <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">
              Restricted access — authorised personnel only
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-sm font-medium text-brand-700 mb-1">
                Admin Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@lanturn.in"
                className="w-full rounded-lg border border-brand-200 bg-white px-4 py-3 text-sm text-brand-900
                           placeholder:text-brand-400 outline-none
                           focus:border-brand-900 focus:ring-2 focus:ring-brand-100
                           transition-all duration-200"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-brand-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full rounded-lg border border-brand-200 bg-white px-4 py-3 pr-11 text-sm text-brand-900
                             placeholder:text-brand-400 outline-none
                             focus:border-brand-900 focus:ring-2 focus:ring-brand-100
                             transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            <button
              id="btn-admin-login"
              type="submit"
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold
                         bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]
                         transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signingIn ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  Sign In as Admin
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="divider my-6" />

          <p className="text-xs text-center text-brand-400 leading-relaxed">
            This portal is for authorised administrators only.
            <br />Unauthorised access attempts are logged.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-brand-400 mt-6">
          &copy; {new Date().getFullYear()} lanTURN &middot; Admin Portal
        </p>
      </div>
    </div>
  );
}
