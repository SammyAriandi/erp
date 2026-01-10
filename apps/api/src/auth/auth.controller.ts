import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt/jwt-auth.guard';
import { CurrentUser, CurrentUserType } from './current-user.decorator';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { Permissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.tenantCode, dto.email, dto.password);
  }
  
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: CurrentUserType) {
    return { ok: true, user };
  }

  @Get('admin-only')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
adminOnly(@CurrentUser() user: CurrentUserType) {
  return { ok: true, msg: 'You are allowed', user };
  }

  @Get('perm-test')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('user.manage')
permTest(@CurrentUser() user: CurrentUserType) {
  return { ok: true, msg: 'Permission OK', user };
}

}
