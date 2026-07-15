import mongoose, { Schema, Document } from 'mongoose';
import { MIN_PASSING_SCORE } from '../../shared/trainingModule';

export interface ICertificate extends Document {
    participantId: mongoose.Types.ObjectId;
    certificateId?: string | null;
    moduleId: string;
    score: number;
    status: 'generated' | 'blocked' | 'not_generated';
    reason?: 'score_below_minimum';
    issuedAt?: Date;
}

const CertificateSchema = new Schema<ICertificate>({
    participantId: { type: Schema.Types.ObjectId, ref: 'Participant', required: true },
    certificateId: { type: String, trim: true, maxlength: 100 },
    moduleId: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    status: {
        type: String,
        enum: ['generated', 'blocked', 'not_generated'],
        required: true
    },
    reason: {
        type: String,
        enum: ['score_below_minimum'],
        required: function (this: ICertificate) { return this.status === 'blocked'; }
    },
    issuedAt: { type: Date }
});

CertificateSchema.pre('validate', function () {
    if (this.status === 'generated') {
        if (!this.certificateId) this.invalidate('certificateId', 'Un certificado generado requiere certificateId.');
        if (this.score < MIN_PASSING_SCORE) this.invalidate('score', 'La nota no permite generar un certificado.');
        this.issuedAt ??= new Date();
        this.reason = undefined;
        return;
    }

    this.certificateId = undefined;
    this.issuedAt = undefined;
    if (this.status !== 'blocked') this.reason = undefined;
});

CertificateSchema.index(
    { certificateId: 1 },
    { unique: true, partialFilterExpression: { certificateId: { $type: 'string' } } }
);
CertificateSchema.index({ participantId: 1, moduleId: 1 }, { unique: true });

export default mongoose.model<ICertificate>('Certificate', CertificateSchema);
