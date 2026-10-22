import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { LogProvider } from '@/contexts/LogContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Shell } from '@/components/Shell'
import { queryClient } from '@/lib/queryClient'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'

// Secondary screens load on demand to keep first paint and logging fast.
const Diary = lazy(() => import('@/pages/Diary').then((m) => ({ default: m.Diary })))
const Progress = lazy(() => import('@/pages/Progress').then((m) => ({ default: m.Progress })))
const Foods = lazy(() => import('@/pages/Foods').then((m) => ({ default: m.Foods })))
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))
const Fasting = lazy(() => import('@/pages/Fasting').then((m) => ({ default: m.Fasting })))

const Fallback = <div className="p-8 text-sm text-faint">Loading…</div>

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <ToastProvider>
            <BrowserRouter>
              <LogProvider>
              <Suspense fallback={Fallback}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route element={<ProtectedRoute><Shell /></ProtectedRoute>}>
                    <Route index element={<Home />} />
                    <Route path="diary" element={<Diary />} />
                    <Route path="progress" element={<Progress />} />
                    <Route path="foods" element={<Foods />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="fasting" element={<Fasting />} />
                    <Route path="*" element={<div className="p-8"><h1 className="text-lg font-semibold">Not found</h1></div>} />
                  </Route>
                </Routes>
              </Suspense>
              </LogProvider>
            </BrowserRouter>
          </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
