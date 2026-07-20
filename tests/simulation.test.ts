import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getCompletedSimulationDecisionIds,
    getNextSimulationDecisionId,
    publicSimulationScenario,
    SIMULATION_DECISION_IDS,
    TRAINING_SIMULATION,
    validateSimulationDecisionInput,
} from '../server/domain/simulation';

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
