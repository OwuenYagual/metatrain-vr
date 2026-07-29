import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/apiClient';
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
        <main style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.75rem' }}>Crear cuenta - MetaTrain VR</h1>
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
            {success && <p role="status" style={{ color: '#166534' }}>{success}</p>}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="register-name">Nombre completo:</label>
                    <input
                        id="register-name"
                        autoComplete="name"
                        type="text"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        required
                        style={{ width: '100%', padding: '0.5rem' }}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="register-email">Correo electrónico:</label>
                    <input
                        id="register-email"
                        autoComplete="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        style={{ width: '100%', padding: '0.5rem' }}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="register-password">Contraseña:</label>
                    <input
                        id="register-password"
                        autoComplete="new-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        required
                        style={{ width: '100%', padding: '0.5rem' }}
                    />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', cursor: 'pointer' }}>
                    {loading ? 'Creando cuenta...' : 'Registrarse'}
                </button>
            </form>
            <p style={{ marginTop: '1rem' }}>
                ¿Ya tienes cuenta? <Link to="/login">Inicia sesión aquí</Link>
            </p>
        </main>
    );
}
