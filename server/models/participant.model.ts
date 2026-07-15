import mongoose, { Schema, Document } from 'mongoose';
import { AVATAR_IDS } from '../domain/avatars';

export interface IParticipant extends Document {
    fullName: string;
    email: string;
    passwordHash: string;
    avatarId: 'avatar_01' | 'avatar_02' | 'avatar_03' | null;
    role: 'participant' | 'admin';
    createdAt: Date;
}

const ParticipantSchema: Schema = new Schema({
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    avatarId: {
        type: String,
        enum: [...AVATAR_IDS, null],
        default: null
    },
    role: {
        type: String,
        enum: ['participant', 'admin'],
        default: 'participant'
    },
    createdAt: { type: Date, default: Date.now, immutable: true }
}, {
    toJSON: {
        transform: (_document, returnedObject: Record<string, unknown>) => {
            delete returnedObject.passwordHash;
            delete returnedObject.__v;
            returnedObject.id = returnedObject._id;
            delete returnedObject._id;
            return returnedObject;
        }
    }
});

export default mongoose.model<IParticipant>('Participant', ParticipantSchema);
