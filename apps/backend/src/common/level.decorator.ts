import { SetMetadata } from '@nestjs/common';

/** Minimum permission_level required. Levels: employee 10, manager 50, owner 100. */
export const LEVEL_KEY = 'required_level';
export const RequireLevel = (level: number) => SetMetadata(LEVEL_KEY, level);

export const LEVELS = { employee: 10, manager: 50, owner: 100 } as const;
export type RoleName = 'owner' | 'manager' | 'employee';
export const ROLE_LEVEL: Record<RoleName, number> = { employee: 10, manager: 50, owner: 100 };
