import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { BloodStoreProvider } from './store/useBloodStore';
import { Header } from './components/common/Header';
import { MobileNav } from './components/common/MobileNav';
import { Footer } from './components/common/Footer';
import { OfflineBanner } from './components/common/OfflineBanner';
import { RoleGuard } from './components/common/RoleGuard';

import { LandingPage } from './views/LandingPage';
import { PatientView } from './views/PatientView';
import { CreateRequestView } from './views/CreateRequestView';
import { RequestConfirmView } from './views/RequestConfirmView';
import { TrackRequestView } from './views/TrackRequestView';
import { DonorView } from './views/DonorView';
import { BloodCentreView } from './views/BloodCentreView';
import { CoordinatorView } from './views/CoordinatorView';
import { AdminView } from './views/AdminView';
import { SimulationView } from './views/SimulationView';

export const App: React.FC = () => {
  return (
    <BloodStoreProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
          <OfflineBanner />
          <Header />

          <main className="flex-grow pb-24 md:pb-12">
            <Routes>
              {/* Public & All Roles */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/simulation" element={<SimulationView />} />

              {/* Patient / Attendant Workspace */}
              <Route
                path="/patient"
                element={
                  <RoleGuard allowedRoles={['patient', 'admin']}>
                    <PatientView />
                  </RoleGuard>
                }
              />

              {/* Emergency Request Flow */}
              <Route
                path="/request"
                element={
                  <RoleGuard allowedRoles={['patient', 'coordinator', 'admin']}>
                    <CreateRequestView />
                  </RoleGuard>
                }
              />
              <Route
                path="/request/confirm/:id"
                element={
                  <RoleGuard allowedRoles={['patient', 'coordinator', 'admin']}>
                    <RequestConfirmView />
                  </RoleGuard>
                }
              />
              <Route
                path="/request/track/:id"
                element={
                  <RoleGuard allowedRoles={['patient', 'coordinator', 'admin']}>
                    <TrackRequestView />
                  </RoleGuard>
                }
              />

              {/* Donor Workspace */}
              <Route
                path="/donor"
                element={
                  <RoleGuard allowedRoles={['donor', 'admin']}>
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

              {/* System Administrator Workspace */}
              <Route
                path="/admin"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <AdminView />
                  </RoleGuard>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<LandingPage />} />
            </Routes>
          </main>

          <Footer />
          <MobileNav />
        </div>
      </BrowserRouter>
    </BloodStoreProvider>
  );
};

export default App;
