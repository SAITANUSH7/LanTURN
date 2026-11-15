import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Navbar from './Navbar.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { studentService } from '../services/student.service.js';
import { applicationService } from '../services/application.service.js';
import { employerService } from '../services/employer.service.js';

const PUBLIC_PATHS = ['/login', '/onboarding'];

export default function Layout() {
  const { firebaseUser, role } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isPublic = PUBLIC_PATHS.includes(location.pathname);

  // Prefetch dashboard data on mount so first paint is fast
  useEffect(() => {
    if (!firebaseUser || isPublic || !role) return;

    if (role === 'student') {
      queryClient.prefetchQuery({ queryKey: ['student', 'me'], queryFn: studentService.getMe });
      queryClient.prefetchQuery({ queryKey: ['applications', 'mine'], queryFn: () => applicationService.listMine({ limit: 5 }) });
    } else if (role === 'employer') {
      queryClient.prefetchQuery({ queryKey: ['employer', 'me'], queryFn: employerService.getMe });
      queryClient.prefetchQuery({ queryKey: ['employer', 'analytics'], queryFn: employerService.getAnalytics });
    }
  }, [firebaseUser, role, isPublic, queryClient]);

  // Parallax scroll driver — updates CSS custom property on body
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          document.body.style.setProperty('--scroll-y', String(window.scrollY));
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-transparent">
      {firebaseUser && !isPublic && <Navbar />}
      <main className={`${firebaseUser && !isPublic ? 'pt-14' : ''}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}