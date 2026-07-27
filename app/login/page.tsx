'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, ArrowRight } from 'lucide-react'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Simulate login
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    setIsLoading(false)
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/40 mb-4">
            <div className="text-3xl font-black text-emerald-300">Q</div>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">
            Welcome Back
          </h1>
          <p className="text-slate-400">
            Sign in to continue your learning journey
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          {/* Email Input */}
          <div className="relative group">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="relative group">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                required
              />
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded accent-emerald-500" />
              <span className="text-slate-400">Remember me</span>
            </label>
            <a href="#" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              Forgot password?
            </a>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-1 shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            <div className="relative bg-gradient-to-r from-emerald-500 to-emerald-600 group-hover:from-emerald-500 group-hover:to-emerald-600 rounded-[10px] px-6 py-3 flex items-center justify-center gap-2 transition-all duration-300">
              <span className="font-bold text-white">
                {isLoading ? 'Signing in...' : 'Sign In'}
              </span>
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </div>
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px bg-gradient-to-r from-slate-700 to-transparent flex-1" />
          <span className="text-slate-500 text-sm">New here?</span>
          <div className="h-px bg-gradient-to-l from-slate-700 to-transparent flex-1" />
        </div>

        {/* Sign Up Link */}
        <button
          onClick={() => router.push('/signup')}
          className="w-full group relative overflow-hidden rounded-xl bg-slate-800/50 border border-slate-700/50 p-1 shadow-lg hover:shadow-xl hover:border-slate-600/50 transition-all duration-300"
        >
          <div className="relative bg-slate-800/50 group-hover:bg-slate-800/70 rounded-[10px] px-6 py-3 flex items-center justify-center gap-2 transition-all duration-300">
            <span className="font-bold text-white">
              Create Account
            </span>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
          </div>
        </button>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-8">
          By signing in, you agree to our{' '}
          <a href="#" className="text-emerald-400 hover:text-emerald-300 transition-colors">
            Terms of Service
          </a>
          {' '}and{' '}
          <a href="#" className="text-emerald-400 hover:text-emerald-300 transition-colors">
            Privacy Policy
          </a>
        </p>
      </div>
    </main>
  )
}
