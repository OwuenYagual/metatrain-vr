import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './auth/AuthPage';
import RegisterPage from './auth/RegisterPage';
import { authService } from './auth/authService';
import { UserMenu } from './auth/UserMenu';
import './App.css';

const AvatarSelector = lazy(() => import('./avatar/AvatarSelector'));
const CampusPage = lazy(() => import('./campus/CampusPage'));

function ProtectedRoute({ children }: { children: ReactNode }) {
    return authService.getCurrentSession() ? <>{children}<UserMenu /></> : <Navigate to="/login" replace />;
}

export default function App() {
    const fallback = <p style={{ padding: '2rem' }}>Cargando módulo...</p>;

    return (
        <Router>
            <Suspense fallback={fallback}>
                <Routes>
                    <Route path="/" element={<Navigate to="/login" replace />} />
                    <Route path="/login" element={<AuthPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/avatar-selector" element={
                        <ProtectedRoute><AvatarSelector /></ProtectedRoute>
                    } />
                    <Route path="/campus/:zoneId" element={
                        <ProtectedRoute><CampusPage /></ProtectedRoute>
                    } />
                    <Route path="/training" element={
                        <ProtectedRoute><Navigate to="/campus/induction-office" replace /></ProtectedRoute>
                    } />
                    <Route path="/simulation" element={
                        <ProtectedRoute><Navigate to="/campus/simulation-lab" replace /></ProtectedRoute>
                    } />
                    <Route path="/evaluation" element={
                        <ProtectedRoute><Navigate to="/campus/assessment-room" replace /></ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </Router>
    );
}
