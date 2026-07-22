import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInteractionInput, validateProgressItemInput } from '../server/domain/progress';

test('acepta únicamente eventos de interacción definidos por el contrato', () => {
    const valid = validateInteractionInput({ moduleId: 'induccion_001', objectId: 'obj_manual', eventType: 'click' });
    const invalid = validateInteractionInput({ moduleId: 'induccion_001', objectId: 'obj_manual', eventType: 'delete_all' });
    assert.equal(valid.ok, true);
    assert.equal(invalid.ok, false);
});

test('valida el contenido con un módulo dinámico', () => {
    assert.equal(validateProgressItemInput({ moduleId: 'induccion_001', contentId: 'ct_01' }, 'contentId').ok, true);
    assert.equal(validateProgressItemInput({ moduleId: '', contentId: 'ct_01' }, 'contentId').ok, false);
});
