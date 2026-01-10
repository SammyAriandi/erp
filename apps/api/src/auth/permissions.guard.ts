import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { userId: string; tenantId: string };

    if (!user?.userId || !user?.tenantId) {
      throw new ForbiddenException('Missing user context');
    }

    const rows = await this.prisma.rolePermission.findMany({
      where: {
        tenantId: user.tenantId,
        role: {
          users: { some: { tenantId: user.tenantId, userId: user.userId } },
        },
      },
      select: { permission: { select: { key: true } } },
    });

    const userPerms = new Set(rows.map(r => r.permission.key));
    const ok = required.every(p => userPerms.has(p));
    if (!ok) throw new ForbiddenException('Missing permission');

    return true;
  }
}
