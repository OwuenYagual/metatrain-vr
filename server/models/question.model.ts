import mongoose, { Schema, Document } from 'mongoose';

export interface IOption {
    id: string;
    text: string;
}

export interface IQuestion extends Document {
    moduleId: string;
    text: string;
    options: IOption[];
    correctOptionId: string;
    active: boolean;
}

const OptionSchema = new Schema<IOption>({
    id: { type: String, required: true },
    text: { type: String, required: true }
}, { _id: false }); //id automatico desactivado.

const QuestionSchema = new Schema<IQuestion>({
    moduleId: { type: String, required: true },
    text: { type: String, required: true },
    options: { type: [OptionSchema], required: true, validate: [(options: IOption[]) => options.length >= 2, 'Se requieren al menos dos opciones.'] },
    correctOptionId: { type: String, required: true },
    active: { type: Boolean, default: true }
});

QuestionSchema.pre('validate', function () {
    const optionIds = this.options.map((option: IOption) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
        this.invalidate('options', 'Los IDs de las opciones deben ser únicos.');
    }
    if (!optionIds.includes(this.correctOptionId)) {
        this.invalidate('correctOptionId', 'La opción correcta debe existir en options.');
    }
});

QuestionSchema.index({ moduleId: 1, active: 1 });

export default mongoose.model<IQuestion>('Question', QuestionSchema);
