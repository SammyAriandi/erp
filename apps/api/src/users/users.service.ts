import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: {
    tenantId: string;
    email: string;
    name: string;
    password: string;
    roles: Array<'ADMIN' | 'STAFF'>;
  }) {
    const email = input.email.toLowerCase().trim();

    if (!input.roles || input.roles.length === 0) {
      throw new BadRequestException('roles is required');
    }

    // Ensure roles exist in this tenant
    const roleRows = await this.prisma.role.findMany({
      where: { tenantId: input.tenantId, name: { in: input.roles } },
    });

    if (roleRows.length !== input.roles.length) {
      throw new BadRequestException('One or more roles not found');
    }

    // Hash password
    const hash = await bcrypt.hash(input.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        email,
        name: input.name,
        password: hash,
        role: input.roles.includes('ADMIN') ? 'ADMIN' : 'STAFF', // legacy single role field (temporary)
        isActive: true,
      },
    });

    // Map roles
    await this.prisma.userRole.createMany({
      data: roleRows.map((r) => ({
        tenantId: input.tenantId,
        userId: user.id,
        roleId: r.id,
      })),
      skipDuplicates: true,
    });

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      roles: roleRows.map((r) => r.name),
      isActive: user.isActive,
    };
  }
}
