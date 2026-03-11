import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Leaf, AlertCircle } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { username: 'state_admin', role: 'State Level', color: 'text-purple-400' },
  { username: 'thrissur_admin', role: 'District Level', color: 'text-blue-400' },
  { username: 'chalakudy_admin', role: 'Block Level', color: 'text-yellow-400' },
  { username: 'mala_admin', role: 'Panchayat Level', color: 'text-green-400' },
];

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (u) => {
    setUsername(u);
    setPassword('password');
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-green-900/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-teal-900/10 rounded-full blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#22c55e" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="w-full max-w-md relative z-10 fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-900/50 border border-green-700/50 rounded-2xl mb-4">
            <Leaf className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Smart Panchayat</h1>
          <p className="text-gray-500 text-sm mt-1">Kerala IoT Monitoring System</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-100 mb-5">Sign in to your account</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-900/30 border border-red-700/50 text-red-400 px-3 py-2 rounded-lg text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-field"
                placeholder="Enter username"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Demo accounts */}
        <div className="mt-4 card p-4">
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">Demo Accounts (password: <code className="text-green-400">password</code>)</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.username}
                onClick={() => fillDemo(acc.username)}
                className="text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700/50 group"
              >
                <div className={`text-xs font-medium ${acc.color}`}>{acc.role}</div>
                <div className="text-gray-400 text-xs font-mono mt-0.5">{acc.username}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
