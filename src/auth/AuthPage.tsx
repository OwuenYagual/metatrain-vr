import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from './authService';
import { getErrorMessage } from '../api/apiClient';
import { progressService } from '../progress/progressService';
import { APP_CONFIG } from '../config/appConfig';

export default function AuthPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const session = await authService.login(email, password);
            const progress = await progressService.getParticipantProgress(
                session.participant.id,
                APP_CONFIG.TRAINING_MODULE_ID
            ).catch((progressError: unknown) => {
                console.warn('No se pudo recuperar el progreso después del login:', progressError);
                return null;
            });
            if (!session.participant.avatarId) {
                navigate('/avatar-selector');
            } else if (progress?.status === 'approved' || progress?.status === 'failed') {
                navigate('/evaluation');
            } else {
                navigate('/training');
            }
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Credenciales inválidas.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
            <h2>Iniciar Sesión</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}

            <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Correo Electrónico:</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.5rem' }} />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Contraseña:</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.5rem' }} />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', cursor: 'pointer' }}>
                    {loading ? 'Ingresando...' : 'Ingresar'}
                </button>
            </form>
            <p style={{ marginTop: '1rem' }}>
                ¿No tienes cuenta? <Link to="/register">Regístrate aquí</Link>
            </p>
        </div>
    );
}
