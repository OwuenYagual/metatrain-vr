import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CAMPUS_GUIDE_OBJECT_ID,
    CAMPUS_MANIFEST,
    createDefaultPlayerLocation,
} from '../shared/campus';
import {
    canEnterCampusLocation,
    canUseCampusObject,
    getCampusProgressState,
    progressIdentityFilter,
    recoverPlayerLocation,
} from '../server/domain/campusAccess';
import {
    validateActiveCampusContext,
    validateInteractionInput,
    validateLocationInput,
} from '../server/domain/progress';
import {
    createSimulationRun,
    SIMULATION_DECISION_IDS,
    TRAINING_SIMULATION,
} from '../server/domain/simulation';
import TrainingProgress, { type ITrainingProgress } from '../server/models/progress.model';

const requiredContents = ['c1', 'c2', 'c3', 'c4'];

function progress(overrides: Partial<ITrainingProgress> = {}): ITrainingProgress {
    return {
        completedContents: [],
        simulationDecisions: [],
        status: 'in_progress',
        ...overrides,
    } as ITrainingProgress;
}

test('el índice de progreso incorpora la versión curricular', () => {
    const indexes = TrainingProgress.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => (
        fields.participantId === 1
        && fields.moduleId === 1
        && fields.moduleVersion === 1
        && options.unique === true
    )));
});

test('la lectura de versión uno incluye registros legacy sin moduleVersion', () => {
    const filter = progressIdentityFilter('507f1f77bcf86cd799439011');
    assert.deepEqual(filter.$or, [
        { moduleVersion: 1 },
        { moduleVersion: { $exists: false } },
    ]);
});

test('calcula desbloqueos únicamente con contenidos y decisiones canónicas', () => {
    const complete = progress({
        completedContents: [...requiredContents, 'contenido_antiguo'],
        simulationDecisions: SIMULATION_DECISION_IDS.map((decisionId) => ({
            scenarioId: TRAINING_SIMULATION.id,
            decisionId,
            selectedOptionId: 'opcion',
        })) as ITrainingProgress['simulationDecisions'],
        status: 'approved',
    });
    assert.deepEqual(getCampusProgressState(complete, requiredContents), {
        trainingCompleted: true,
        simulationCompleted: true,
        approved: true,
    });
    assert.equal(canEnterCampusLocation('assessment-room', 'assessment-entry', getCampusProgressState(
        complete,
        requiredContents,
    )), true);
});

test('desbloquea la evaluación con una jornada inmersiva V2 completada', () => {
    const run = createSimulationRun(
        'run-campus-completed',
        'evt-campus-start',
        new Date('2026-08-05T13:00:00.000Z'),
    );
    run.status = 'completed';
    run.currentStageId = undefined;
    run.completedAt = new Date('2026-08-05T14:00:00.000Z');
    run.stages.forEach((stage) => {
        stage.status = 'completed';
        stage.completedAt = run.completedAt;
    });
    const complete = progress({
        completedContents: requiredContents,
        simulationRuns: [run],
    });
    assert.deepEqual(getCampusProgressState(complete, requiredContents), {
        trainingCompleted: true,
        simulationCompleted: true,
        approved: false,
    });
});

test('rechaza objetos usados desde otra zona o antes de desbloquearlos', () => {
    const locked = { trainingCompleted: false, simulationCompleted: false, approved: false };
    const approved = { trainingCompleted: true, simulationCompleted: true, approved: true };
    assert.equal(canUseCampusObject('lobby', 'obj_manual', approved), false);
    assert.equal(canUseCampusObject('lobby', CAMPUS_GUIDE_OBJECT_ID, locked), true);
    assert.equal(canUseCampusObject('simulation-lab', 'obj_simulation_terminal', locked), false);
    assert.equal(canUseCampusObject('assessment-room', 'obj_certificate_kiosk', approved), true);
});

test('recupera el lobby cuando la ubicación guardada es inválida o sigue bloqueada', () => {
    const stored = progress({
        lastLocation: {
            worldId: CAMPUS_MANIFEST.worldId,
            worldVersion: CAMPUS_MANIFEST.worldVersion,
            zoneId: 'assessment-room',
            spawnId: 'assessment-entry',
            savedAt: new Date(),
        },
    });
    assert.deepEqual(recoverPlayerLocation(stored, {
        trainingCompleted: false,
        simulationCompleted: false,
        approved: false,
    }), createDefaultPlayerLocation());
});

test('una interacción nueva exige contexto y coincide con el campus activo', () => {
    const missingContext = validateInteractionInput({
        moduleId: CAMPUS_MANIFEST.moduleId,
        objectId: 'obj_manual',
        eventType: 'click',
    }, true);
    assert.equal(missingContext.ok, false);

    const valid = validateInteractionInput({
        clientEventId: 'evt-001',
        moduleId: CAMPUS_MANIFEST.moduleId,
        moduleVersion: CAMPUS_MANIFEST.moduleVersion,
        worldVersion: CAMPUS_MANIFEST.worldVersion,
        zoneId: 'induction-office',
        objectId: 'obj_manual',
        eventType: 'click',
        durationSeconds: 12,
    }, true);
    assert.equal(valid.ok, true);
    if (valid.ok) assert.equal(validateActiveCampusContext(valid.value).ok, true);
});

test('la ubicación exige un spawn exacto de su zona', () => {
    const base = {
        clientEventId: 'evt-location-001',
        moduleId: CAMPUS_MANIFEST.moduleId,
        moduleVersion: CAMPUS_MANIFEST.moduleVersion,
        worldVersion: CAMPUS_MANIFEST.worldVersion,
        zoneId: 'lobby',
    };
    assert.equal(validateLocationInput({ ...base, spawnId: 'lobby-entry' }).ok, true);
    assert.equal(validateLocationInput({ ...base, spawnId: 'assessment-entry' }).ok, false);
});
