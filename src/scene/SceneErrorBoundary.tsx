import { Component, type ErrorInfo, type ReactNode } from 'react';

export class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Error cargando el escenario 3D:', error, info.componentStack);
    }

    render() {
        if (this.state.failed) {
            return (
                <section role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
                    <h2>El escenario 3D no pudo cargarse</h2>
                    <p>Puedes reintentar sin perder tu progreso guardado.</p>
                    <button type="button" onClick={() => window.location.reload()}>Reintentar</button>
                </section>
            );
        }
        return this.props.children;
    }
}
