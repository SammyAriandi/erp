import { Controller, Body, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('user.manage')
  async create(@CurrentUser() me: CurrentUserType, @Body() dto: CreateUserDto) {
    return this.users.createUser({
      tenantId: me.tenantId,
      email: dto.email,
      name: dto.name,
      password: dto.password,
      roles: dto.roles,
    });
  }
}