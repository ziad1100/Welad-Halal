import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user;
});
export interface ReqUser {
  id: string;
  username: string;
  fullName: string;
  role: 'owner' | 'manager' | 'employee';
  permissionLevel: number;
  isOwner: boolean;
}
