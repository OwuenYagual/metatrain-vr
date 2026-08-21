import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/apiClient';
import { APP_CONFIG } from '../config/appConfig';
import { progressService } from '../progress/progressService';
import { AuthLayout } from './AuthLayout';
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
        <AuthLayout
            eyebrow="Acceso al campus"
            title="Iniciar sesión"
            description="Continúa tu recorrido de capacitación desde el último punto guardado."
        >
            {error && <p role="alert" className="auth-message auth-message-error">{error}</p>}

            <form className="auth-form" onSubmit={handleLogin}>
                <div className="auth-field">
                    <label htmlFor="login-email">Correo electrónico</label>
                    <input
                        id="login-email"
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </div>
                <div className="auth-field">
                    <label htmlFor="login-password">Contraseña</label>
                    <input
                        id="login-password"
                        autoComplete="current-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />
                </div>
                <button className="auth-submit" type="submit" disabled={loading}>
                    {loading ? 'Ingresando...' : 'Ingresar'}
                </button>
            </form>
            <p className="auth-switch">
                ¿No tienes cuenta? <Link to="/register">Regístrate aquí</Link>
            </p>
        </AuthLayout>
    );
}
