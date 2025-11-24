
import { DEFAULT_ERROR_MESSAGE } from '../constants';
import { UserProfile } from '../types';

export const getFormattedErrorMessage = (
    error: unknown,
    contextMessage?: string,
    defaultMessage: string = DEFAULT_ERROR_MESSAGE
): string => {
    const baseErrorMessage = error instanceof Error ? error.message : defaultMessage;
    if (contextMessage) {
        return `${contextMessage}: ${baseErrorMessage}`;
    }
    return baseErrorMessage;
};

export const generateRandomIp = (): string => {
    const part1 = Math.floor(Math.random() * 255);
    const part2 = Math.floor(Math.random() * 255);
    return `(${part1}.${part2})`;
};

export const getCurrentTimestamp = (): string => {
    return new Date().toLocaleString('ko-KR', { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
};

export const getDetailedTimestamp = (dateOffset: number = 0): string => {
    const date = new Date(Date.now() - dateOffset);
    return date.toLocaleString('ko-KR', { 
        year: '2-digit', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
};

export const resolveUserNickname = (userProfile: UserProfile | null): string => {
    if (!userProfile) return '';
    
    if (userProfile.nicknameType === 'ANONYMOUS') {
        return `${userProfile.nickname}${userProfile.ip || ''}`;
    }
    return userProfile.nickname;
};
