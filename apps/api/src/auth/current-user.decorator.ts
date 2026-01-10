import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentUserType = {
  userId: string;
  tenantId: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
  email: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserType => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
