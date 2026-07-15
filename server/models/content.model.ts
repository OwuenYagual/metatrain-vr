import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainingContent extends Document {
    moduleId: string;
    title: string;
    body: string;
    order: number;
    active: boolean;
    interactionObjectId: string;
}

const TrainingContentSchema: Schema = new Schema({
    moduleId: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    order: { type: Number, required: true },
    active: { type: Boolean, default: true },
    interactionObjectId: { type: String, required: true, trim: true, maxlength: 100 }
});

TrainingContentSchema.index({ moduleId: 1, interactionObjectId: 1 }, { unique: true });
TrainingContentSchema.index({ moduleId: 1, active: 1, order: 1 });

export default mongoose.model<ITrainingContent>('TrainingContent', TrainingContentSchema);
