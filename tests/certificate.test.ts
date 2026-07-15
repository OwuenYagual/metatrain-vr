import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import Certificate from '../server/models/certificate.model';
import { buildCertificatePdf, createCertificateId } from '../server/domain/certificate';

test('genera identificadores de certificado únicos y no predecibles', () => {
    const issuedAt = new Date('2026-07-15T12:00:00.000Z');
    const firstId = createCertificateId(issuedAt);
    const secondId = createCertificateId(issuedAt);
    assert.match(firstId, /^MTVR-2026-[0-9A-F-]{36}$/);
    assert.notEqual(firstId, secondId);
});

test('el certificado PDF tiene una página horizontal y metadatos', async () => {
    const issuedAt = new Date('2026-07-15T12:00:00.000Z');
    const bytes = await buildCertificatePdf({
        certificateId: 'MTVR-2026-11111111-2222-4333-8444-555555555555',
        participantName: 'Ana Pérez',
        score: 100,
        issuedAt,
    });
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString('ascii'), '%PDF-');

    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 1);
    const page = document.getPage(0);
    assert.ok(page.getWidth() > page.getHeight());
    assert.equal(document.getAuthor(), 'MetaTrain');
    assert.equal(document.getSubject(), 'Inducción Corporativa');
});

test('el modelo garantiza un certificado por participante y módulo', () => {
    const uniqueParticipantModuleIndex = Certificate.schema.indexes().some(([fields, options]) => (
        fields.participantId === 1
        && fields.moduleId === 1
        && options.unique === true
    ));
    assert.equal(uniqueParticipantModuleIndex, true);
});
