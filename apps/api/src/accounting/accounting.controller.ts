import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentUser, CurrentUserType } from '../auth/current-user.decorator';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateJournalDto } from './dto/create-journal.dto';

@Controller('accounting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingController {
  constructor(private readonly svc: AccountingService) {}

  @Post('accounts')
  @Permissions('accounting.coa.manage')
  createAccount(@CurrentUser() me: CurrentUserType, @Body() dto: CreateAccountDto) {
    return this.svc.createAccount(me.tenantId, dto);
  }

  @Get('accounts')
  @Permissions('accounting.read')
  listAccounts(@CurrentUser() me: CurrentUserType) {
    return this.svc.listAccounts(me.tenantId);
  }

  @Post('journals')
  @Permissions('accounting.journal.write')
  createJournal(@CurrentUser() me: CurrentUserType, @Body() dto: CreateJournalDto) {
    return this.svc.createJournalDraft(me.tenantId, me.userId, dto);
  }

  @Post('journals/:id/post')
  @Permissions('accounting.journal.post')
  post(@CurrentUser() me: CurrentUserType, @Param('id') id: string) {
    return this.svc.postJournal(me.tenantId, me.userId, id);
  }
}
