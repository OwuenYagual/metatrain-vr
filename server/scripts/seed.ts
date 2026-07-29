import mongoose from 'mongoose';
import { env } from '../config/env';
import TrainingContent from '../models/content.model';
import Question from '../models/question.model';
import { TRAINING_MODULE_ID } from '../../shared/trainingModule';

const moduleId = TRAINING_MODULE_ID;

const contents = [
    { interactionObjectId: 'obj_manual', title: 'Políticas y convivencia', body: 'Practica confidencialidad, respeto y uso responsable de los recursos corporativos.', order: 1 },
    { interactionObjectId: 'obj_rrhh', title: 'Departamentos y personas', body: 'Explora el organigrama, las personas de referencia y los canales de cada departamento.', order: 2 },
    { interactionObjectId: 'obj_funciones', title: 'Funciones de tu puesto', body: 'Organiza las responsabilidades del Analista de Operaciones durante una jornada.', order: 3 },
    { interactionObjectId: 'obj_seguridad', title: 'Red de apoyo', body: 'Identifica el departamento correcto para resolver necesidades laborales, técnicas y de seguridad.', order: 4 },
    { interactionObjectId: 'obj_examen', title: 'Reto del primer día', body: 'Construye una tarjeta práctica con las funciones que aplicarás en tu puesto.', order: 5 },
];

const questions = [
    ['¿Dónde debe manejarse la información interna?', ['En herramientas corporativas autorizadas', 'En correos y carpetas personales'], 'a'],
    ['¿Qué departamento acompaña beneficios y convivencia laboral?', ['Talento Humano', 'Tecnología'], 'a'],
    ['¿Quién gestiona accesos, equipos y aplicaciones?', ['Dirección General', 'Tecnología'], 'b'],
    ['¿Cuál es la primera acción del Analista de Operaciones al iniciar la jornada?', ['Revisar prioridades, plazos y responsables', 'Modificar el proceso sin autorización'], 'a'],
    ['¿Qué debe hacer el empleado cuando encuentra un bloqueo?', ['Ocultarlo hasta terminar la jornada', 'Comunicarlo al supervisor y proponer el siguiente paso'], 'b'],
] as const;

async function seed() {
    await mongoose.connect(env.mongoUri);

    await Question.updateMany({ moduleId }, { $set: { active: false } });

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
