import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/** Decorator: requires the authenticated user to have ALL listed permissions.
 *  Owner always passes (all permissions are inferred, never stored). */
export const RequirePermission = (...perms: string[]) => SetMetadata(PERMISSION_KEY, perms);
