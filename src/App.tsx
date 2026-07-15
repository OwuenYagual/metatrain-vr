import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './auth/AuthPage';
import RegisterPage from './auth/RegisterPage';
import { authService } from './auth/authService';

const AvatarSelector = lazy(() => import('./avatar/AvatarSelector'));
const TrainingPage = lazy(() => import('./training/TrainingPage'));
const EvaluationPage = lazy(() => import('./evaluation/EvaluationPage'));

function ProtectedRoute({ children }: { children: ReactNode }) {
    return authService.getCurrentSession() ? children : <Navigate to="/login" replace />;
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
                    <Route path="/training" element={
                        <ProtectedRoute><TrainingPage /></ProtectedRoute>
                    } />
                    <Route path="/evaluation" element={
                        <ProtectedRoute><EvaluationPage /></ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </Router>
    );
}
