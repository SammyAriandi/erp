import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions('accounting.coa.manage')
  async list(
    @CurrentUser() me: CurrentUserType,
    @Query('limit') limitStr?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitStr ?? '50', 10) || 50, 1), 200);

    return this.prisma.auditLog.findMany({
      where: {
        tenantId: me.tenantId,
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
