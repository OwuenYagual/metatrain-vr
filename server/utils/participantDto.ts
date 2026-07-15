import type { IParticipant } from '../models/participant.model';

export type ParticipantDto = {
    id: string;
    fullName: string;
    email: string;
    avatarId: IParticipant['avatarId'];
    role: IParticipant['role'];
    createdAt: Date;
};

export function toParticipantDto(participant: IParticipant): ParticipantDto {
    return {
        id: participant._id.toString(),
        fullName: participant.fullName,
        email: participant.email,
        avatarId: participant.avatarId,
        role: participant.role,
        createdAt: participant.createdAt,
    };
}
