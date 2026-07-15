import { randomUUID } from 'node:crypto';
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { TRAINING_MODULE_TITLE } from '../../shared/trainingModule';

export type CertificatePdfInput = {
    certificateId: string;
    participantName: string;
    score: number;
    issuedAt: Date;
};

export function createCertificateId(issuedAt = new Date()): string {
    return `MTVR-${issuedAt.getUTCFullYear()}-${randomUUID().toUpperCase()}`;
}

function drawCenteredText(
    page: PDFPage,
    text: string,
    y: number,
    font: PDFFont,
    size: number,
    color = rgb(0.09, 0.13, 0.23),
) {
    const { width } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
}

function normalizePdfText(value: string): string {
    return value.normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function fitTextSize(font: PDFFont, text: string, preferredSize: number, minSize: number, maxWidth: number): number {
    let size = preferredSize;
    while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
    return size;
}

export async function buildCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
    const document = await PDFDocument.create();
    const page = document.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
    const { width, height } = page.getSize();
    const regularFont = await document.embedFont(StandardFonts.Helvetica);
    const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.06, 0.12, 0.24);
    const blue = rgb(0.12, 0.35, 0.78);
    const green = rgb(0.09, 0.45, 0.24);
    const muted = rgb(0.32, 0.38, 0.48);

    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.97, 0.98, 1) });
    page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: navy, borderWidth: 2 });
    page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: blue, borderWidth: 0.8 });
    page.drawRectangle({ x: 0, y: height - 78, width, height: 78, color: navy });

    drawCenteredText(page, 'METATRAIN', height - 50, boldFont, 21, rgb(1, 1, 1));
    drawCenteredText(page, 'CERTIFICADO DE APROBACIÓN', height - 132, boldFont, 28, navy);
    drawCenteredText(page, 'Se certifica que', height - 174, regularFont, 13, muted);
    const participantName = normalizePdfText(input.participantName);
    const participantNameSize = fitTextSize(boldFont, participantName, 28, 14, width - 140);
    drawCenteredText(page, participantName, height - 224, boldFont, participantNameSize, blue);
    drawCenteredText(page, 'completó y aprobó satisfactoriamente el módulo', height - 260, regularFont, 13, muted);
    drawCenteredText(page, TRAINING_MODULE_TITLE, height - 300, boldFont, 21, navy);

    page.drawRectangle({ x: width / 2 - 72, y: height - 365, width: 144, height: 40, color: rgb(0.9, 0.97, 0.92), borderColor: green, borderWidth: 1 });
    drawCenteredText(page, `NOTA: ${input.score}%`, height - 351, boldFont, 16, green);

    const issuedDate = new Intl.DateTimeFormat('es-EC', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Guayaquil',
    }).format(input.issuedAt);
    drawCenteredText(page, `Emitido el ${issuedDate}`, 116, regularFont, 11, muted);
    drawCenteredText(page, `Código de verificación: ${input.certificateId}`, 82, regularFont, 9, muted);
    drawCenteredText(page, 'La autenticidad de este documento puede verificarse en MetaTrain.', 58, regularFont, 8, muted);

    document.setTitle(`Certificado - ${participantName}`);
    document.setAuthor('MetaTrain');
    document.setSubject(TRAINING_MODULE_TITLE);
    document.setCreator('MetaTrain');
    document.setProducer('MetaTrain');
    document.setCreationDate(input.issuedAt);
    document.setModificationDate(input.issuedAt);
    return document.save();
}
