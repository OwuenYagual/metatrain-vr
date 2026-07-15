import assert from 'node:assert/strict';
import test from 'node:test';
import Certificate from '../server/models/certificate.model';
import EvaluationResult from '../server/models/evaluation.model';
import Participant from '../server/models/participant.model';
import Question from '../server/models/question.model';
import { AVAILABLE_AVATARS } from '../server/domain/avatars';

test('los tres avatares predefinidos usan modelos GLB', () => {
    assert.equal(AVAILABLE_AVATARS.length, 3);
    assert.equal(new Set(AVAILABLE_AVATARS.map((avatar) => avatar.id)).size, 3);
    assert.ok(AVAILABLE_AVATARS.every((avatar) => avatar.modelUrl.endsWith('.glb')));
});

test('Participant nunca serializa passwordHash', () => {
    const participant = new Participant({
        fullName: 'Ana Pérez',
        email: 'ana@empresa.com',
        passwordHash: 'hash-sensible',
    });
    assert.equal('passwordHash' in participant.toJSON(), false);
});

test('Question exige que la respuesta correcta exista en options', async () => {
    const question = new Question({
        moduleId: 'induccion_001',
        text: 'Pregunta',
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        correctOptionId: 'c',
    });
    await assert.rejects(question.validate());
});

test('EvaluationResult mantiene correctAnswers y status coherentes', async () => {
    const evaluation = new EvaluationResult({
        participantId: '507f1f77bcf86cd799439011',
        moduleId: 'induccion_001',
        totalQuestions: 5,
        correctAnswers: 6,
        score: 60,
        status: 'approved',
    });
    await assert.rejects(evaluation.validate());
});

test('EvaluationResult calcula la puntuación a partir de las respuestas correctas', async () => {
    const evaluation = new EvaluationResult({
        participantId: '507f1f77bcf86cd799439011',
        moduleId: 'induccion_001',
        totalQuestions: 5,
        correctAnswers: 4,
        score: 70,
        status: 'approved',
    });
    await assert.rejects(evaluation.validate());
});

test('un certificado no generado no recibe ID ni fecha de emisión', async () => {
    const certificate = new Certificate({
        participantId: '507f1f77bcf86cd799439011',
        moduleId: 'induccion_001',
        score: 60,
        status: 'not_generated',
        certificateId: null,
    });
    await certificate.validate();
    assert.equal(certificate.certificateId, undefined);
    assert.equal(certificate.issuedAt, undefined);
});
