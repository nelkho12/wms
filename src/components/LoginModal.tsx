import React, { useEffect, useState } from 'react';
import { LogIn, Lock, Mail, Boxes, Server, ShieldAlert, CheckCircle2, Loader2, Settings2 } from 'lucide-react';
import { UserProfile } from '../types/roles';
import { checkServer, loginRequest, RolePermissionMap } from '../services/api';
import { getServerUrl, needsServerAddress, normalizeServerUrl, setServerUrl, setToken } from '../services/http';

interface LoginModalProps {
  isOpen: boolean;
  onLogin: (user: UserProfile, rolePermissions: RolePermissionMap) => void;
  /** E-mail to pre-fill (used after "sign in as another user"). */
  prefillEmail?: string;
  /** Message such as "Your session expired". */
  notice?: string;
}

/**
 * Full-screen sign-in. The desktop app also asks here for the address of the computer
 * that runs the ApexWMS service (and remembers it).
 */
export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onLogin, prefillEmail, notice }) => {
  const askAddress = needsServerAddress();
  const [serverUrl, setServerUrlInput] = useState(getServerUrl());
  const [showServer, setShowServer] = useState(askAddress && !getServerUrl());
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [email, setEmail] = useState(prefillEmail || '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail);
  }, [prefillEmail]);

  // Check the service whenever the screen opens or the address is changed.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setServerOk(null);
    const timer = setTimeout(async () => {
      if (askAddress && !getServerUrl()) return;
      const ok = await checkServer();
      if (!cancelled) setServerOk(ok);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, serverUrl, askAddress]);

  if (!isOpen) return null;

  const applyServerUrl = (value: string) => {
    setServerUrlInput(value);
    setServerUrl(value); // saved right away so the check above uses it
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (askAddress && !normalizeServerUrl(serverUrl)) {
      setShowServer(true);
      setError('Enter the address of the ApexWMS service first (for example 192.168.1.20:3000).');
      return;
    }
    if (!email.trim() || !password) {
      setError('Enter your e-mail and password.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await loginRequest(email.trim(), password);
      setToken(result.token);
      setPassword('');
      onLogin(result.user, result.rolePermissions);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden my-6">
        <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-md border border-indigo-400/30">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-white">ApexWMS</span>
              <p className="text-xs text-slate-300 font-medium">Warehouse Management System</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {notice && !error && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold">{notice}</div>
          )}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {(askAddress || showServer) && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                <Server className="w-3.5 h-3.5 mr-1 text-slate-500" /> ApexWMS service address
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => applyServerUrl(e.target.value)}
                placeholder="192.168.1.20:3000"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
              />
              <p className="text-[11px] mt-1 flex items-center">
                {serverOk === true && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">Connected to the service</span>
                  </>
                )}
                {serverOk === false && <span className="text-rose-700 font-semibold">Cannot reach the service at this address.</span>}
                {serverOk === null && serverUrl && <span className="text-slate-500">Checking...</span>}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
              <Mail className="w-3.5 h-3.5 mr-1 text-slate-500" /> E-mail (or badge code)
            </label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
              <Lock className="w-3.5 h-3.5 mr-1 text-slate-500" /> Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center space-x-2 text-sm"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
          </button>

          {!askAddress && !showServer && (
            <button
              type="button"
              onClick={() => setShowServer(true)}
              className="w-full text-[11px] text-slate-500 hover:text-slate-700 flex items-center justify-center cursor-pointer"
            >
              <Settings2 className="w-3 h-3 mr-1" /> Use a different service address
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
