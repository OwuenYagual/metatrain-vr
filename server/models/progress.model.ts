import mongoose, { Schema, Document } from 'mongoose';
import {
    SIMULATION_EVIDENCE_OBJECT_IDS,
    SIMULATION_STAGE_IDS,
    type SimulationAttemptKind,
    type SimulationAttemptResult,
    type SimulationEvidenceObjectId,
    type SimulationRunStatus,
    type SimulationStageId,
    type SimulationStageStatus,
} from '../../shared/simulation';

export const LEGACY_MODULE_VERSION = 1;
export const LEGACY_WORLD_VERSION = 1;

export interface IPlayerLocation {
    worldId: string;
    worldVersion: number;
    zoneId: string;
    spawnId: string;
    savedAt: Date;
}

// Interfaz para eventos de interacción 3D
export interface IInteractionEvent {
    // Opcionales para poder leer interacciones creadas antes del campus versionado.
    clientEventId?: string;
    moduleVersion?: number;
    worldVersion?: number;
    zoneId?: string;
    objectId: string;
    eventType: 'click' | 'proximity' | 'content_opened';
    timestamp: Date;
}

// Interfaz para decisiones de la simulación
export interface ISimulationDecision {
    participantId: mongoose.Types.ObjectId;
    clientEventId?: string;
    moduleVersion?: number;
    worldVersion?: number;
    zoneId?: string;
    scenarioId: string;
    decisionId: string;
    selectedOptionId: string;
    timestamp: Date;
}

export interface ISimulationInspection {
    clientEventId: string;
    stageId: SimulationStageId;
    objectId: SimulationEvidenceObjectId;
    timestamp: Date;
}

export interface ISimulationAttempt {
    clientEventId: string;
    stageId: SimulationStageId;
    actionId: string;
    kind: SimulationAttemptKind;
    result: SimulationAttemptResult;
    consequence: string;
    timestamp: Date;
}

export interface ISimulationStageProgress {
    stageId: SimulationStageId;
    status: SimulationStageStatus;
    inspections: ISimulationInspection[];
    attempts: ISimulationAttempt[];
    completedAt?: Date;
}

export interface ISimulationRun {
    runId: string;
    simulationVersion: number;
    scenarioId: string;
    status: SimulationRunStatus;
    currentStageId?: SimulationStageId;
    startClientEventIds: string[];
    startedAt: Date;
    completedAt?: Date;
    lastUpdatedAt: Date;
    stages: ISimulationStageProgress[];
}

// Interfaz principal del progreso 
export interface ITrainingProgress extends Document {
    participantId: mongoose.Types.ObjectId;
    moduleId: string;
    moduleVersion: number;
    worldVersion: number;
    lastLocation?: IPlayerLocation;
    processedClientEventIds: string[];
    // Campo legado conservado para leer progresos creados antes de eliminar los checkpoints.
    visitedCheckpoints?: string[];
    completedContents: string[];
    interactions: IInteractionEvent[];
    simulationDecisions: ISimulationDecision[];
    simulationRuns?: ISimulationRun[];
    score: number | null;
    status: 'not_started' | 'in_progress' | 'approved' | 'failed';
    durationSeconds: number;
    lastSavedAt: Date;
}

// Subesquema de Interacciones
const InteractionEventSchema = new Schema<IInteractionEvent>({
    clientEventId: { type: String, trim: true, maxlength: 100 },
    moduleVersion: { type: Number, min: 1 },
    worldVersion: { type: Number, min: 1 },
    zoneId: { type: String, trim: true, maxlength: 100 },
    objectId: { type: String, required: true },
    eventType: { type: String, enum: ['click', 'proximity', 'content_opened'], required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const PlayerLocationSchema = new Schema<IPlayerLocation>({
    worldId: { type: String, required: true, trim: true, maxlength: 100 },
    worldVersion: { type: Number, required: true, min: 1 },
    zoneId: { type: String, required: true, trim: true, maxlength: 100 },
    spawnId: { type: String, required: true, trim: true, maxlength: 100 },
    savedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

// Subesquema de Decisiones
const SimulationDecisionSchema = new Schema<ISimulationDecision>({
    participantId: { type: Schema.Types.ObjectId, ref: 'Participant', required: true },
    clientEventId: { type: String, trim: true, maxlength: 100 },
    moduleVersion: { type: Number, min: 1 },
    worldVersion: { type: Number, min: 1 },
    zoneId: { type: String, trim: true, maxlength: 100 },
    scenarioId: { type: String, required: true, maxlength: 100 },
    decisionId: { type: String, required: true, maxlength: 100 },
    selectedOptionId: { type: String, required: true, maxlength: 100 },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const SimulationInspectionSchema = new Schema<ISimulationInspection>({
    clientEventId: { type: String, required: true, trim: true, maxlength: 100 },
    stageId: { type: String, enum: SIMULATION_STAGE_IDS, required: true },
    objectId: { type: String, enum: SIMULATION_EVIDENCE_OBJECT_IDS, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
}, { _id: false });

const SimulationAttemptSchema = new Schema<ISimulationAttempt>({
    clientEventId: { type: String, required: true, trim: true, maxlength: 100 },
    stageId: { type: String, enum: SIMULATION_STAGE_IDS, required: true },
    actionId: { type: String, required: true, trim: true, maxlength: 100 },
    kind: { type: String, enum: ['initial', 'correction'], required: true },
    result: { type: String, enum: ['consequence', 'resolved'], required: true },
    consequence: { type: String, required: true, maxlength: 1000 },
    timestamp: { type: Date, required: true, default: Date.now },
}, { _id: false });

const SimulationStageProgressSchema = new Schema<ISimulationStageProgress>({
    stageId: { type: String, enum: SIMULATION_STAGE_IDS, required: true },
    status: {
        type: String,
        enum: ['locked', 'awaiting_inspection', 'ready_for_action', 'pending_correction', 'completed'],
        required: true,
    },
    inspections: { type: [SimulationInspectionSchema], default: [] },
    attempts: { type: [SimulationAttemptSchema], default: [] },
    completedAt: { type: Date },
}, { _id: false });

const SimulationRunSchema = new Schema<ISimulationRun>({
    runId: { type: String, required: true, trim: true, maxlength: 100 },
    simulationVersion: { type: Number, required: true, min: 1 },
    scenarioId: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, enum: ['in_progress', 'completed', 'abandoned'], required: true },
    currentStageId: { type: String, enum: SIMULATION_STAGE_IDS },
    startClientEventIds: {
        type: [{ type: String, required: true, trim: true, maxlength: 100 }],
        default: [],
    },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    lastUpdatedAt: { type: Date, required: true, default: Date.now },
    stages: { type: [SimulationStageProgressSchema], required: true, default: [] },
}, { _id: false });

// Esquema Principal 
const TrainingProgressSchema = new Schema<ITrainingProgress>({
    participantId: { type: Schema.Types.ObjectId, ref: 'Participant', required: true },
    moduleId: { type: String, required: true },
    moduleVersion: { type: Number, required: true, default: LEGACY_MODULE_VERSION, min: 1 },
    worldVersion: { type: Number, required: true, default: LEGACY_WORLD_VERSION, min: 1 },
    lastLocation: { type: PlayerLocationSchema, default: undefined },
    processedClientEventIds: {
        type: [{ type: String, trim: true, maxlength: 100 }],
        default: [],
        select: false,
    },
    visitedCheckpoints: { type: [{ type: String, maxlength: 100 }], default: undefined },
    completedContents: [{ type: String, maxlength: 100 }],
    interactions: { type: [InteractionEventSchema], default: [] },
    simulationDecisions: { type: [SimulationDecisionSchema], default: [] },
    simulationRuns: { type: [SimulationRunSchema], default: undefined },
    score: { type: Number, default: null, min: 0, max: 100 },
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'approved', 'failed'],
        default: 'not_started'
    },
    durationSeconds: { type: Number, default: 0, min: 0 },
    lastSavedAt: { type: Date, default: Date.now }
});

// Una versión curricular nueva conserva el historial previo sin mezclar recorridos.
TrainingProgressSchema.index(
    { participantId: 1, moduleId: 1, moduleVersion: 1 },
    { unique: true, name: 'participant_module_curriculum_unique' },
);
TrainingProgressSchema.index({ lastSavedAt: -1 });

export default mongoose.model<ITrainingProgress>('TrainingProgress', TrainingProgressSchema);
