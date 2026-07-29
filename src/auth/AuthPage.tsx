import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';
import { progressService } from '../progress/progressService';
import { authService } from './authService';

export default function AuthPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            const session = await authService.login(email, password);
            const progress = await progressService.getParticipantProgress(
                session.participant.id,
                APP_CONFIG.TRAINING_MODULE_ID,
            ).catch((progressError: unknown) => {
                console.warn('No se pudo recuperar el progreso después del login:', progressError);
                return null;
            });

            if (!session.participant.avatarId) {
                navigate('/avatar-selector');
            } else {
                navigate(`/campus/${progress?.lastLocation.zoneId ?? 'lobby'}`);
            }
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'Credenciales inválidas.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.75rem' }}>Iniciar sesión</h1>
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}

            <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="login-email">Correo electrónico:</label>
                    <input
                        id="login-email"
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        style={{ width: '100%', padding: '0.5rem' }}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="login-password">Contraseña:</label>
                    <input
                        id="login-password"
                        autoComplete="current-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        style={{ width: '100%', padding: '0.5rem' }}
                    />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', cursor: 'pointer' }}>
                    {loading ? 'Ingresando...' : 'Ingresar'}
                </button>
            </form>
            <p style={{ marginTop: '1rem' }}>
                ¿No tienes cuenta? <Link to="/register">Regístrate aquí</Link>
            </p>
        </main>
    );
}
