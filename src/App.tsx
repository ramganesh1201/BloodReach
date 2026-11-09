import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BloodStoreProvider } from './store/useBloodStore';
import { Header } from './components/common/Header';
import { MobileNav } from './components/common/MobileNav';
import { Footer } from './components/common/Footer';
import { OfflineBanner } from './components/common/OfflineBanner';
import { RoleGuard } from './components/common/RoleGuard';
import { GlobalCallManager } from './components/communication/GlobalCallManager';

// Lazy-loaded Views for optimal initial bundle & performance
const LandingPage = lazy(() => import('./views/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginView = lazy(() => import('./views/LoginView').then(m => ({ default: m.LoginView })));
const PatientView = lazy(() => import('./views/PatientView').then(m => ({ default: m.PatientView })));
const CreateRequestView = lazy(() => import('./views/CreateRequestView').then(m => ({ default: m.CreateRequestView })));
const RequestConfirmView = lazy(() => import('./views/RequestConfirmView').then(m => ({ default: m.RequestConfirmView })));
const TrackRequestView = lazy(() => import('./views/TrackRequestView').then(m => ({ default: m.TrackRequestView })));
const DonorView = lazy(() => import('./views/DonorView').then(m => ({ default: m.DonorView })));
const BloodCentreView = lazy(() => import('./views/BloodCentreView').then(m => ({ default: m.BloodCentreView })));
const CoordinatorView = lazy(() => import('./views/CoordinatorView').then(m => ({ default: m.CoordinatorView })));
const HospitalView = lazy(() => import('./views/HospitalView').then(m => ({ default: m.HospitalView })));
const HospitalRegisterView = lazy(() => import('./views/HospitalRegisterView').then(m => ({ default: m.HospitalRegisterView })));
const SmsResponseView = lazy(() => import('./views/SmsResponseView').then(m => ({ default: m.SmsResponseView })));
const AdminView = lazy(() => import('./views/AdminView').then(m => ({ default: m.AdminView })));
const CommunicationView = lazy(() => import('./views/CommunicationView').then(m => ({ default: m.CommunicationView })));

const RouteLoadingFallback = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 space-y-3">
    <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
    <span className="text-xs font-medium text-app-text-secondary">Loading CareLoop Workspace...</span>
  </div>
);

export const App: React.FC = () => {
  return (
    <BloodStoreProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-app-bg text-app-text-primary flex flex-col font-sans selection:bg-brand selection:text-white overflow-x-clip">
          <OfflineBanner />
          <GlobalCallManager />
          <Header />

          <main className="flex-grow pb-24 md:pb-12">
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                {/* Public Landing & Overview */}
                <Route path="/" element={<LandingPage />} />

                {/* Unified Authentication Portal */}
                <Route path="/login" element={<LoginView />} />
                <Route path="/register" element={<LoginView initialMode="signup" />} />

                {/* Emergency Blood Request Flow (Public/Guest & Authenticated) */}
                <Route path="/request" element={<CreateRequestView />} />
                <Route path="/request/confirm/:id" element={<RequestConfirmView />} />
                <Route path="/request/track" element={<TrackRequestView />} />
                <Route path="/request/track/:id" element={<TrackRequestView />} />

                {/* Emergency Response Token Link (DLT/SMS single-use callback) */}
                <Route path="/respond/:token" element={<SmsResponseView />} />

                {/* Hospital Registration (Public / Institutional) */}
                <Route path="/hospital/register" element={<HospitalRegisterView />} />

                {/* Patient / Attendant Workspace */}
                <Route
                  path="/patient"
                  element={
                    <RoleGuard allowedRoles={['patient', 'coordinator', 'admin']}>
                      <PatientView />
                    </RoleGuard>
                  }
                />

                {/* Donor Workspace */}
                <Route
                  path="/donor"
                  element={
                    <RoleGuard allowedRoles={['donor', 'coordinator', 'admin']}>
                      <DonorView />
                    </RoleGuard>
                  }
                />

                {/* Blood Centre Operations Workspace */}
                <Route
                  path="/blood-centre"
                  element={
                    <RoleGuard allowedRoles={['blood_centre', 'coordinator', 'admin']}>
                      <BloodCentreView />
                    </RoleGuard>
                  }
                />

                {/* Coordinator Control Room Workspace */}
                <Route
                  path="/coordinator"
                  element={
                    <RoleGuard allowedRoles={['coordinator', 'admin']}>
                      <CoordinatorView />
                    </RoleGuard>
                  }
                />

                {/* Hospital Operations Workspace */}
                <Route
                  path="/hospital"
                  element={
                    <RoleGuard allowedRoles={['hospital', 'blood_centre', 'coordinator', 'admin']}>
                      <HospitalView />
                    </RoleGuard>
                  }
                />

                {/* System Administrator Workspace */}
                <Route
                  path="/admin"
                  element={
                    <RoleGuard allowedRoles={['admin']}>
                      <AdminView />
                    </RoleGuard>
                  }
                />

                {/* Communication Hub Workspace */}
                <Route
                  path="/communication"
                  element={
                    <RoleGuard allowedRoles={['patient', 'donor', 'blood_centre', 'hospital', 'coordinator', 'admin']}>
                      <CommunicationView />
                    </RoleGuard>
                  }
                />

                {/* Redirect any other path to Home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>

          <Footer />
          <MobileNav />
        </div>
      </BrowserRouter>
    </BloodStoreProvider>
  );
};

export default App;
