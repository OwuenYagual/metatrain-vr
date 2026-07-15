import mongoose, { Schema, Document } from 'mongoose';

// Interfaz para eventos de interacción 3D
export interface IInteractionEvent {
    objectId: string;
    eventType: 'click' | 'proximity' | 'content_opened';
    timestamp: Date;
}

// Interfaz para decisiones de la simulación
export interface ISimulationDecision {
    participantId: mongoose.Types.ObjectId;
    scenarioId: string;
    decisionId: string;
    selectedOptionId: string;
    timestamp: Date;
}

// Interfaz principal del progreso 
export interface ITrainingProgress extends Document {
    participantId: mongoose.Types.ObjectId;
    moduleId: string;
    visitedCheckpoints: string[];
    completedContents: string[];
    interactions: IInteractionEvent[];
    simulationDecisions: ISimulationDecision[];
    score: number | null;
    status: 'not_started' | 'in_progress' | 'approved' | 'failed';
    durationSeconds: number;
    lastSavedAt: Date;
}

// Subesquema de Interacciones
const InteractionEventSchema = new Schema<IInteractionEvent>({
    objectId: { type: String, required: true },
    eventType: { type: String, enum: ['click', 'proximity', 'content_opened'], required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

// Subesquema de Decisiones
const SimulationDecisionSchema = new Schema<ISimulationDecision>({
    participantId: { type: Schema.Types.ObjectId, ref: 'Participant', required: true },
    scenarioId: { type: String, required: true, maxlength: 100 },
    decisionId: { type: String, required: true, maxlength: 100 },
    selectedOptionId: { type: String, required: true, maxlength: 100 },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

// Esquema Principal 
const TrainingProgressSchema = new Schema<ITrainingProgress>({
    participantId: { type: Schema.Types.ObjectId, ref: 'Participant', required: true },
    moduleId: { type: String, required: true },
    visitedCheckpoints: [{ type: String, maxlength: 100 }],
    completedContents: [{ type: String, maxlength: 100 }],
    interactions: { type: [InteractionEventSchema], default: [] },
    simulationDecisions: { type: [SimulationDecisionSchema], default: [] },
    score: { type: Number, default: null, min: 0, max: 100 },
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'approved', 'failed'],
        default: 'not_started'
    },
    durationSeconds: { type: Number, default: 0, min: 0 },
    lastSavedAt: { type: Date, default: Date.now }
});

// Índice compuesto para asegurar que un participante solo tenga un registro de progreso por módulo
TrainingProgressSchema.index({ participantId: 1, moduleId: 1 }, { unique: true });
TrainingProgressSchema.index({ lastSavedAt: -1 });

export default mongoose.model<ITrainingProgress>('TrainingProgress', TrainingProgressSchema);
