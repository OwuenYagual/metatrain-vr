import type { ReactNode } from 'react';
import heroImage from '../assets/hero.png';
import './AuthPages.css';

type AuthLayoutProps = {
    children: ReactNode;
    description: string;
    eyebrow: string;
    title: string;
};

export function AuthLayout({ children, description, eyebrow, title }: AuthLayoutProps) {
    return (
        <main className="auth-page">
            <section className="auth-intro" aria-label="MetaTrain VR">
                <div className="auth-brand" aria-label="MetaTrain VR, inicio">
                    <span className="auth-brand-mark" aria-hidden="true">M</span>
                    <span>METATRAIN <strong>VR</strong></span>
                </div>

                <div className="auth-intro-copy">
                    <p className="auth-intro-label">ENTRENAMIENTO INMERSIVO</p>
                    <h2>Prepárate para actuar con seguridad.</h2>
                    <p>
                        Recorre escenarios laborales, practica decisiones críticas y avanza a tu ritmo en un entorno virtual seguro.
                    </p>
                </div>

                <div className="auth-visual" aria-hidden="true">
                    <div className="auth-visual-orbit" />
                    <img src={heroImage} alt="" />
                </div>

                <p className="auth-intro-note">Formación práctica. Progreso verificable.</p>
            </section>

            <section className="auth-panel">
                <div className="auth-panel-inner">
                    <div className="auth-heading">
                        <p>{eyebrow}</p>
                        <h1>{title}</h1>
                        <span>{description}</span>
                    </div>
                    {children}
                </div>
            </section>
        </main>
    );
}
