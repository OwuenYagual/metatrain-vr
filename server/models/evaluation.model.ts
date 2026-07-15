import mongoose, { Schema, Document } from 'mongoose';
import { MIN_PASSING_SCORE } from '../../shared/trainingModule';

export interface IEvaluationResult extends Document {
    participantId: mongoose.Types.ObjectId;
    moduleId: string;
    totalQuestions: number;
    correctAnswers: number;
    score: number;
    status: 'approved' | 'failed';
    createdAt: Date;
}

const EvaluationResultSchema = new Schema<IEvaluationResult>({
    participantId: { type: Schema.Types.ObjectId, ref: 'Participant', required: true },
    moduleId: { type: String, required: true },
    totalQuestions: { type: Number, required: true, min: 1 },
    correctAnswers: {
        type: Number,
        required: true,
        min: 0,
        validate: {
            validator(this: IEvaluationResult, value: number) {
                return value <= this.totalQuestions;
            },
            message: 'correctAnswers no puede superar totalQuestions.'
        }
    },
    score: { type: Number, required: true, min: 0, max: 100 },
    status: {
        type: String,
        enum: ['approved', 'failed'],
        required: true,
        validate: {
            validator(this: IEvaluationResult, value: IEvaluationResult['status']) {
                return value === (this.score >= MIN_PASSING_SCORE ? 'approved' : 'failed');
            },
            message: 'El estado no coincide con la puntuación.'
        }
    },
    createdAt: { type: Date, default: Date.now }
});

EvaluationResultSchema.pre('validate', function () {
    if (this.totalQuestions > 0 && this.correctAnswers <= this.totalQuestions) {
        const expectedScore = Math.round((this.correctAnswers / this.totalQuestions) * 100);
        if (this.score !== expectedScore) {
            this.invalidate('score', 'La puntuación no coincide con las respuestas correctas.');
        }
    }
});

EvaluationResultSchema.index({ participantId: 1, moduleId: 1, createdAt: -1 });

export default mongoose.model<IEvaluationResult>('EvaluationResult', EvaluationResultSchema);
