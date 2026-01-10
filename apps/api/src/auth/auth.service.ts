import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(tenantCode: string, email: string, password: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { code: tenantCode, isActive: true },
    });

    if (!tenant) throw new UnauthorizedException('Invalid tenant or inactive');

    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email, isActive: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
    };

    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
