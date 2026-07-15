import mongoose from 'mongoose';
import { env } from '../config/env';
import TrainingContent from '../models/content.model';
import Question from '../models/question.model';

const moduleId = 'induccion_001';

const contents = [
    { interactionObjectId: 'obj_manual', title: 'Políticas de la Empresa', body: 'Conoce las políticas generales, los canales internos y las normas básicas de convivencia.', order: 1 },
    { interactionObjectId: 'obj_rrhh', title: 'Departamento de Recursos Humanos', body: 'Identifica los servicios, beneficios y canales de atención de Recursos Humanos.', order: 2 },
    { interactionObjectId: 'obj_funciones', title: 'Funciones de tu Rol', body: 'Revisa las responsabilidades, resultados esperados y canales de escalamiento de tu rol.', order: 3 },
    { interactionObjectId: 'obj_seguridad', title: 'Seguridad Laboral', body: 'Aplica las medidas preventivas y reconoce cómo reportar un incidente de seguridad.', order: 4 },
    { interactionObjectId: 'obj_examen', title: 'Preparación para la Evaluación', body: 'Confirma los requisitos de avance antes de iniciar la evaluación del módulo.', order: 5 },
];

const questions = [
    ['¿Dónde se consultan las políticas internas?', ['En los canales corporativos', 'Solo con clientes'], 'a'],
    ['¿Qué área gestiona beneficios y acompañamiento laboral?', ['Ventas', 'Recursos Humanos'], 'b'],
    ['¿Qué debe hacerse ante un incidente de seguridad?', ['Reportarlo por el canal definido', 'Ignorarlo'], 'a'],
    ['¿Cuál es el propósito de revisar las funciones del rol?', ['Conocer responsabilidades y resultados', 'Evitar la coordinación'], 'a'],
    ['¿Qué se requiere antes de la evaluación?', ['Completar el recorrido y los contenidos', 'Cerrar la sesión'], 'a'],
] as const;

async function seed() {
    await mongoose.connect(env.mongoUri);

    for (const content of contents) {
        await TrainingContent.findOneAndUpdate(
            { moduleId, interactionObjectId: content.interactionObjectId },
            { ...content, moduleId, active: true },
            { upsert: true, runValidators: true }
        );
    }

    for (const [text, optionTexts, correctOptionId] of questions) {
        await Question.findOneAndUpdate(
            { moduleId, text },
            {
                moduleId,
                text,
                options: optionTexts.map((optionText, optionIndex) => ({
                    id: optionIndex === 0 ? 'a' : 'b',
                    text: optionText,
                })),
                correctOptionId,
                active: true,
            },
            { upsert: true, runValidators: true }
        );
    }

    console.log(`Datos iniciales creados para ${moduleId}.`);
}

seed()
    .catch((error: unknown) => {
        console.error('No se pudieron crear los datos iniciales:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
