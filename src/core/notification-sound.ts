export const notificationSounds = ['soft', 'bell', 'double'] as const;
export type NotificationSound = (typeof notificationSounds)[number];
