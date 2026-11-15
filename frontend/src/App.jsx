import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { RequireAuth, RequireOnboarded, RequireRole } from './hooks/useAuth.jsx';

// Eager-load: login page (first thing users see)
import LoginPage from './pages/LoginPage.jsx';

// Lazy-load everything else — each becomes its own chunk
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));

const StudentDashboard = lazy(() => import('./pages/student/DashboardPage.jsx'));
const JobsPage = lazy(() => import('./pages/student/JobsPage.jsx'));
const ApplicationsPage = lazy(() => import('./pages/student/ApplicationsPage.jsx'));
const StudentProfilePage = lazy(() => import('./pages/student/ProfilePage.jsx'));
const AIAssistantPage = lazy(() => import('./pages/student/AIAssistantPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/student/NotificationsPage.jsx'));
const CareerAIslePage = lazy(() => import('./pages/student/CareerAIslePage.jsx'));
const NetworkingPage = lazy(() => import('./pages/NetworkingPage.jsx'));

const EmployerDashboard = lazy(() => import('./pages/employer/DashboardPage.jsx'));
const EmployerJobsPage = lazy(() => import('./pages/employer/JobsPage.jsx'));
const JobApplicantsPage = lazy(() => import('./pages/employer/JobApplicantsPage.jsx'));
const EmployerProfilePage = lazy(() => import('./pages/employer/ProfilePage.jsx'));
const EmployerNotificationsPage = lazy(() => import('./pages/employer/NotificationsPage.jsx'));
const AIHiringAssistantPage = lazy(() => import('./pages/employer/AIHiringAssistantPage.jsx'));

const AdminPage = lazy(() => import('./pages/admin/AdminPage.jsx'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage.jsx'));

import DeepamLoader from './components/ui/DeepamLoader.jsx';

// Deepam (South Indian oil lamp) loader — only shows if loading takes >1s
function PageLoader() {
  return <DeepamLoader size="lg" delay={1000} />;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<Layout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />

        {/* Auth required */}
        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Suspense fallback={<PageLoader />}><OnboardingPage /></Suspense>} />

          {/* Onboarded users only */}
          <Route element={<RequireOnboarded />}>
            {/* Student routes */}
            <Route element={<RequireRole roles={['student']}>
              <Outlet />
            </RequireRole>}>
              <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><StudentDashboard /></Suspense>} />
              <Route path="/jobs" element={<Suspense fallback={<PageLoader />}><JobsPage /></Suspense>} />
              <Route path="/job-search" element={<Navigate to="/jobs" replace />} />
              <Route path="/applications" element={<Suspense fallback={<PageLoader />}><ApplicationsPage /></Suspense>} />
              <Route path="/profile" element={<Suspense fallback={<PageLoader />}><StudentProfilePage /></Suspense>} />
              <Route path="/ai" element={<Suspense fallback={<PageLoader />}><AIAssistantPage /></Suspense>} />
              <Route path="/career-aisle" element={<Suspense fallback={<PageLoader />}><CareerAIslePage /></Suspense>} />
              <Route path="/networking" element={<Suspense fallback={<PageLoader />}><NetworkingPage /></Suspense>} />
              <Route path="/notifications" element={<Suspense fallback={<PageLoader />}><NotificationsPage /></Suspense>} />
            </Route>

            {/* Employer routes */}
            <Route element={<RequireRole roles={['employer']}>
              <Outlet />
            </RequireRole>}>
              <Route path="/employer/dashboard" element={<Suspense fallback={<PageLoader />}><EmployerDashboard /></Suspense>} />
              <Route path="/employer/jobs" element={<Suspense fallback={<PageLoader />}><EmployerJobsPage /></Suspense>} />
              <Route path="/employer/jobs/:jobId/applicants" element={<Suspense fallback={<PageLoader />}><JobApplicantsPage /></Suspense>} />
              <Route path="/employer/networking" element={<Suspense fallback={<PageLoader />}><NetworkingPage /></Suspense>} />
              <Route path="/employer/ai-assistant" element={<Suspense fallback={<PageLoader />}><AIHiringAssistantPage /></Suspense>} />
              <Route path="/employer/profile" element={<Suspense fallback={<PageLoader />}><EmployerProfilePage /></Suspense>} />
              <Route path="/employer/notifications" element={<Suspense fallback={<PageLoader />}><EmployerNotificationsPage /></Suspense>} />
            </Route>

            {/* Admin routes */}
            <Route element={<RequireRole roles={['admin']}>
              <Outlet />
            </RequireRole>}>
              <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* Landing page (outside Layout — has its own nav/footer) */}
      <Route path="/" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}