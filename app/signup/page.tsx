'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, Mail, Lock, Phone, Calendar, Award, ArrowRight, ChevronLeft } from 'lucide-react'

export default function Signup() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    gender: '',
    educationLevel: '',
    learningGoals: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match!')
      return
    }

    setIsLoading(true)
    
    // Simulate signup
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    setIsLoading(false)
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/login')}
            className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-white">
              Join the Learning Quest
            </h1>
            <p className="text-slate-400 text-sm">
              Create your account to start earning points
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* First Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                First Name
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="John"
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                  required
                />
              </div>
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Last Name
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Doe"
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                  required
                />
              </div>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                required
              />
            </div>
          </div>

          {/* Phone Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Phone Number */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+1 (555) 000-0000"
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                  required
                />
              </div>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Date of Birth
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                  required
                />
              </div>
            </div>
          </div>

          {/* Gender Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Gender */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Gender
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                required
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </div>

            {/* Education Level */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Education Level
              </label>
              <select
                name="educationLevel"
                value={formData.educationLevel}
                onChange={handleChange}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                required
              >
                <option value="">Select level</option>
                <option value="high-school">High School</option>
                <option value="bachelor">Bachelor&apos;s</option>
                <option value="master">Master&apos;s</option>
                <option value="phd">PhD</option>
                <option value="professional">Professional</option>
              </select>
            </div>
          </div>

          {/* Learning Goals */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              What are your learning goals?
            </label>
            <textarea
              name="learningGoals"
              value={formData.learningGoals}
              onChange={handleChange}
              placeholder="E.g., Improve my math skills, prepare for exams, learn new languages..."
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300 resize-none"
            />
          </div>

          {/* Password Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                  required
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500/50 focus:bg-slate-800/80 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all duration-300"
                  required
                />
              </div>
            </div>
          </div>

          {/* Terms Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-5 h-5 rounded accent-emerald-500 mt-0.5"
              required
            />
            <span className="text-slate-400 text-sm leading-relaxed">
              I agree to the{' '}
              <a href="#" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="#" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                Privacy Policy
              </a>
            </span>
          </label>

          {/* Sign Up Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-1 shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="relative bg-gradient-to-r from-emerald-500 to-emerald-600 group-hover:from-emerald-500 group-hover:to-emerald-600 rounded-[10px] px-6 py-3 flex items-center justify-center gap-2 transition-all duration-300">
              <span className="font-bold text-white">
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </span>
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </div>
          </button>
        </form>

        {/* Sign In Link */}
        <div className="text-center mt-6">
          <p className="text-slate-400">
            Already have an account?{' '}
            <button
              onClick={() => router.push('/login')}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}
