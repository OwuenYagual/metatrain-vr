import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/apiClient';
import { AuthLayout } from './AuthLayout';
import { authService } from './authService';

export default function RegisterPage() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        if (password.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres.');
            return;
        }

        setLoading(true);
        try {
            await authService.register(fullName, email, password);
            setSuccess('Cuenta creada con éxito. Redirigiendo al login...');
            window.setTimeout(() => navigate('/login'), 2000);
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'Ocurrió un error inesperado.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            eyebrow="Nuevo participante"
            title="Crear cuenta"
            description="Registra tus datos para guardar avances, evaluaciones y certificados."
        >
            {error && <p role="alert" className="auth-message auth-message-error">{error}</p>}
            {success && <p role="status" className="auth-message auth-message-success">{success}</p>}

            <form className="auth-form" onSubmit={handleSubmit}>
                <div className="auth-field">
                    <label htmlFor="register-name">Nombre completo</label>
                    <input
                        id="register-name"
                        autoComplete="name"
                        type="text"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        required
                    />
                </div>
                <div className="auth-field">
                    <label htmlFor="register-email">Correo electrónico</label>
                    <input
                        id="register-email"
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </div>
                <div className="auth-field">
                    <label htmlFor="register-password">Contraseña</label>
                    <input
                        id="register-password"
                        autoComplete="new-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        required
                    />
                    <span className="auth-field-help">Usa mínimo 8 caracteres.</span>
                </div>
                <button className="auth-submit" type="submit" disabled={loading}>
                    {loading ? 'Creando cuenta...' : 'Registrarse'}
                </button>
            </form>
            <p className="auth-switch">
                ¿Ya tienes cuenta? <Link to="/login">Inicia sesión aquí</Link>
            </p>
        </AuthLayout>
    );
}
