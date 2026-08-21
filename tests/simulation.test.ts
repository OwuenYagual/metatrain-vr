import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createSimulationRun,
    getCompletedSimulationDecisionIds,
    getNextSimulationDecisionId,
    isSimulationCompleted,
    prepareSimulationAction,
    prepareSimulationInspection,
    publicImmersiveSimulationScenario,
    publicSimulationRun,
    publicSimulationScenario,
    SIMULATION_DECISION_IDS,
    TRAINING_SIMULATION,
    validateSimulationActionInput,
    validateSimulationDecisionInput,
    validateSimulationInspectionInput,
    validateSimulationStartInput,
} from '../server/domain/simulation';
import {
    SIMULATION_STAGE_CATALOG,
    SIMULATION_STAGE_IDS,
    SIMULATION_VERSION,
} from '../shared/simulation';
import TrainingProgress from '../server/models/progress.model';

test('la simulación publica exactamente tres decisiones ordenadas', () => {
    assert.equal(TRAINING_SIMULATION.decisions.length, 3);
    assert.equal(new Set(SIMULATION_DECISION_IDS).size, 3);
    assert.ok(TRAINING_SIMULATION.decisions.every((decision) => (
        decision.options.length >= 2
        && new Set(decision.options.map((option) => option.id)).size === decision.options.length
        && decision.options.filter((option) => option.recommended).length === 1
    )));
});

test('el contrato público no expone retroalimentación ni la opción recomendada', () => {
    const serializedScenario = JSON.stringify(publicSimulationScenario());
    assert.equal(serializedScenario.includes('feedback'), false);
    assert.equal(serializedScenario.includes('recommended'), false);
});

test('valida los identificadores de una decisión de simulación', () => {
    const firstOptionId = TRAINING_SIMULATION.decisions[0].options[0].id;
    const valid = validateSimulationDecisionInput({
        scenarioId: TRAINING_SIMULATION.id,
        decisionId: SIMULATION_DECISION_IDS[0],
        selectedOptionId: firstOptionId,
    });
    const invalid = validateSimulationDecisionInput({
        scenarioId: TRAINING_SIMULATION.id,
        decisionId: '',
        selectedOptionId: firstOptionId,
    });
    assert.equal(valid.ok, true);
    assert.equal(invalid.ok, false);
});

test('determina la siguiente decisión sin contar datos desconocidos', () => {
    const storedDecisions = [
        {
            scenarioId: TRAINING_SIMULATION.id,
            decisionId: SIMULATION_DECISION_IDS[0],
            selectedOptionId: TRAINING_SIMULATION.decisions[0].options[0].id,
        },
        {
            scenarioId: 'escenario_antiguo',
            decisionId: SIMULATION_DECISION_IDS[1],
            selectedOptionId: TRAINING_SIMULATION.decisions[1].options[0].id,
        },
        {
            scenarioId: TRAINING_SIMULATION.id,
            decisionId: 'decision_desconocida',
            selectedOptionId: 'opcion_desconocida',
        },
    ];
    assert.deepEqual(getCompletedSimulationDecisionIds(storedDecisions), [SIMULATION_DECISION_IDS[0]]);
    assert.equal(getNextSimulationDecisionId(storedDecisions), SIMULATION_DECISION_IDS[1]);
});

test('la simulación integra políticas, departamentos y funciones del puesto', () => {
    const scenarioText = JSON.stringify(publicSimulationScenario()).toLowerCase();
    assert.match(scenarioText, /corporativ|confidencial|política/);
    assert.match(scenarioText, /talento humano|tecnología|departamento/);
    assert.match(scenarioText, /supervisor|tablero|procedimiento/);
});

test('marca la simulación completa tras las tres decisiones canónicas', () => {
    const storedDecisions = SIMULATION_DECISION_IDS.map((decisionId) => ({
        scenarioId: TRAINING_SIMULATION.id,
        decisionId,
        selectedOptionId: 'opcion_elegida',
    }));
    assert.deepEqual(getCompletedSimulationDecisionIds(storedDecisions), SIMULATION_DECISION_IDS);
    assert.equal(getNextSimulationDecisionId(storedDecisions), null);
});

test('la simulación inmersiva publica cuatro etapas sin revelar resultados', () => {
    const scenario = publicImmersiveSimulationScenario();
    assert.equal(scenario.simulationVersion, SIMULATION_VERSION);
    assert.deepEqual(scenario.stages.map((stage) => stage.id), SIMULATION_STAGE_IDS);
    assert.deepEqual(scenario.stages, SIMULATION_STAGE_CATALOG);
    assert.ok(scenario.stages.every((stage) => stage.actions.length === 3));
    const serializedScenario = JSON.stringify(scenario);
    assert.equal(serializedScenario.includes('recommended'), false);
    assert.equal(serializedScenario.includes('consequence'), false);
    assert.equal(serializedScenario.includes('observation'), false);
});

test('valida el contexto, la evidencia y las acciones de eventos V2', () => {
    const context = {
        clientEventId: 'evt-simulation-001',
        moduleVersion: 1,
        worldVersion: 1,
        zoneId: 'simulation-lab',
        durationSeconds: 12,
    };
    assert.equal(validateSimulationStartInput(context).ok, true);
    assert.equal(validateSimulationInspectionInput({
        ...context,
        stageId: 'data_protection',
        objectId: 'sim_data_workstation',
    }).ok, true);
    assert.equal(validateSimulationInspectionInput({
        ...context,
        stageId: 'data_protection',
        objectId: 'sim_hr_directory',
    }).ok, false);
    assert.equal(validateSimulationActionInput({
        ...context,
        stageId: 'data_protection',
        actionId: 'use_corporate_channel',
    }).ok, true);
    assert.equal(validateSimulationActionInput({
        ...context,
        stageId: 'data_protection',
        actionId: 'unknown_action',
    }).ok, false);
});

test('una jornada nueva exige inspeccionar antes de actuar', () => {
    const now = new Date('2026-08-05T13:00:00.000Z');
    const run = createSimulationRun('run-001', 'evt-start-001', now);
    assert.equal(run.status, 'in_progress');
    assert.equal(run.currentStageId, 'data_protection');
    assert.deepEqual(run.stages.map((stage) => stage.status), [
        'awaiting_inspection',
        'locked',
        'locked',
        'locked',
    ]);
    assert.equal(prepareSimulationAction(run, 'data_protection', 'use_corporate_channel').ok, false);
    const inspection = prepareSimulationInspection(run, 'data_protection', 'sim_data_workstation');
    assert.equal(inspection.ok, true);
    if (inspection.ok) assert.match(inspection.value.observation, /datos personales/i);
});

test('una acción inadecuada exige una corrección y conserva ambos intentos', () => {
    const now = new Date('2026-08-05T13:00:00.000Z');
    const run = createSimulationRun('run-002', 'evt-start-002', now);
    const firstStage = run.stages[0];
    firstStage.status = 'ready_for_action';

    const initial = prepareSimulationAction(run, 'data_protection', 'use_personal_email');
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    assert.equal(initial.value.kind, 'initial');
    assert.equal(initial.value.result, 'consequence');
    assert.equal(initial.value.nextStageId, null);
    firstStage.attempts.push({
        clientEventId: 'evt-action-incorrect',
        stageId: 'data_protection',
        actionId: 'use_personal_email',
        kind: initial.value.kind,
        result: initial.value.result,
        consequence: initial.value.consequence,
        timestamp: now,
    });
    firstStage.status = 'pending_correction';

    const correction = prepareSimulationAction(run, 'data_protection', 'use_corporate_channel');
    assert.equal(correction.ok, true);
    if (!correction.ok) return;
    assert.equal(correction.value.kind, 'correction');
    assert.equal(correction.value.result, 'resolved');
    assert.equal(correction.value.nextStageId, 'human_resources');
    assert.equal(correction.value.completesRun, false);
});

test('considera completado tanto el recorrido legado como una jornada V2 finalizada', () => {
    const legacyDecisions = SIMULATION_DECISION_IDS.map((decisionId) => ({
        scenarioId: TRAINING_SIMULATION.id,
        decisionId,
        selectedOptionId: 'opcion_elegida',
    }));
    assert.equal(isSimulationCompleted({ simulationDecisions: legacyDecisions }), true);

    const run = createSimulationRun(
        'run-completed',
        'evt-start-completed',
        new Date('2026-08-05T13:00:00.000Z'),
    );
    run.status = 'completed';
    run.currentStageId = undefined;
    run.completedAt = new Date('2026-08-05T14:00:00.000Z');
    run.stages.forEach((stage) => {
        stage.status = 'completed';
        stage.completedAt = run.completedAt;
    });
    assert.equal(isSimulationCompleted({ simulationRuns: [run] }), true);
    const summary = publicSimulationRun(run);
    assert.equal(summary.completedStageCount, 4);
    assert.equal(summary.currentStageId, null);
    assert.equal(JSON.stringify(summary).includes('clientEventId'), false);
});

test('el modelo persiste jornadas V2 sin exigirlas a los progresos legados', async () => {
    const run = createSimulationRun(
        'run-schema',
        'evt-schema-start',
        new Date('2026-08-05T13:00:00.000Z'),
    );
    const immersiveProgress = new TrainingProgress({
        participantId: '507f1f77bcf86cd799439011',
        moduleId: 'induccion_001',
        simulationRuns: [run],
    });
    const legacyProgress = new TrainingProgress({
        participantId: '507f1f77bcf86cd799439012',
        moduleId: 'induccion_001',
    });
    await immersiveProgress.validate();
    await legacyProgress.validate();
    assert.equal(immersiveProgress.simulationRuns?.[0]?.simulationVersion, SIMULATION_VERSION);
    assert.equal(legacyProgress.simulationRuns, undefined);
});
