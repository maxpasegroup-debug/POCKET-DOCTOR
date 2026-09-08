import { z } from 'zod';
import type { User, UserRole } from '../../generated/prisma/client.js';

export const interests = ['Weight Management', 'Diabetes & Lifestyle Health', 'Mental Wellness', 'Nutrition', 'Fitness', 'Sleep', "Women's Health", "Men's Health", 'Preventive Wellness', 'Other'] as const;
export const languages = ['en', 'hi', 'ml', 'ta', 'te', 'kn', 'mr', 'bn'] as const;
export const profileInput = z.object({
  fullName: z.string().trim().min(2).max(100).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value)),
  language: z.enum(languages),
  interests: z.array(z.enum(interests)).max(10).refine(values => new Set(values).size === values.length),
  notifications: z.boolean(),
}).strict();
export type ProfileInput = z.infer<typeof profileInput>;

export function userDto(user: User & { roles: UserRole[] }) {
  return {
    id: user.id, phone: user.phone, fullName: user.fullName, language: user.language,
    interests: user.interests, notifications: user.notifications,
    profileComplete: user.profileCompletedAt !== null, roles: user.roles.map(value => value.role),
  };
}
