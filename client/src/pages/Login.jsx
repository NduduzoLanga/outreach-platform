import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to login');
    }
  };

  return (
    <div
      className="relative isolate flex min-h-[calc(100vh-65px)] items-center justify-center overflow-hidden bg-cover bg-center px-4 py-10 sm:px-8 lg:justify-start lg:px-16"
      style={{ backgroundImage: "url('/brand/early-learning-consultation.png')" }}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-slate-950/10" />
      <section className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/95 p-7 shadow-2xl shadow-slate-900/20 backdrop-blur-md sm:p-10">
        <img
          alt="MyAPI Business"
          className="mb-8 h-auto w-56 max-w-full object-contain object-left"
          src="/brand/myapi-business-logo.png"
        />
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">Azania Paragon Institute</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Welcome back</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in to manage your outreach, lead pipeline, and business opportunities.
        </p>
        <div className="my-7 h-px bg-slate-200" />
        {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="login-email">Email address</label>
            <input
              autoComplete="username"
              id="login-email"
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
              placeholder="you@company.co.za"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="login-password">Password</label>
            <input
              autoComplete="current-password"
              id="login-password"
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 focus:outline-none focus:ring-4 focus:ring-emerald-700/25"
          >
            Sign in to your workspace
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          Need an account?{' '}
          <Link to="/register" className="font-semibold text-emerald-800 hover:text-emerald-950 hover:underline">
            Register here
          </Link>
        </p>
      </section>
    </div>
  );
}
