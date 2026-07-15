import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from './authService';
import { getErrorMessage } from '../api/apiClient';

export default function RegisterPage() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        if (password.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres.');
            return;
        }

        try {
            await authService.register(fullName, email, password);
            setSuccess('Cuenta creada con éxito. Redirigiendo al login...');
            setTimeout(() => navigate('/login'), 2000);
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Ocurrió un error inesperado.'));
        } finally {
            setLoading(false);
        }
    };

    return (

        <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }
        }>
            <h2>Crear Cuenta - MetaTrain VR </h2>
            {error && <p style={{ color: 'red' }}> {error} </p>}
            {success && <p style={{ color: 'green' }}> {success} </p>}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Nombre Completo: </label>
                    < input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required style={{ width: '100%', padding: '0.5rem' }} />
                </div>
                < div style={{ marginBottom: '1rem' }}>
                    <label>Correo Electrónico: </label>
                    < input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.5rem' }} />
                </div>
                < div style={{ marginBottom: '1rem' }}>
                    <label>Contraseña: </label>
                    < input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.5rem' }} />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', cursor: 'pointer' }}>
                    {loading ? 'Creando cuenta...' : 'Registrarse'}
                </button>
            </form>
            < p style={{ marginTop: '1rem' }}>
                ¿Ya tienes cuenta ? <Link to="/login" > Inicia sesión aquí </Link>
            </p>
        </div>
    );
}
