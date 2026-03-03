import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  // -------------------------
  // Accounts / COA
  // -------------------------
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

  @Post('coa/bootstrap')
  @Permissions('accounting.coa.manage')
  bootstrap(@CurrentUser() me: CurrentUserType) {
    return this.svc.bootstrapCoaIdV1(me.tenantId);
  }

  // -------------------------
  // Journals (manual)
  // -------------------------
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

  // -------------------------
  // Journals (engine / auto)
  // -------------------------
  @Post('journals/from-source')
  @Permissions('accounting.journal.post')
  postFromSource(@CurrentUser() me: CurrentUserType, @Body() body: any) {
    return this.svc.postFromSource(me.tenantId, me.userId, body);
  }

  // -------------------------
  // Period Lock (sementara pakai accounting.coa.manage supaya OWNER bisa test)
  // -------------------------
  @Post('period-lock')
  @Permissions('accounting.coa.manage')
  setLock(
    @CurrentUser() me: CurrentUserType,
    @Body() body: { lockUntil: string; reason?: string },
  ) {
    return this.svc.setPeriodLock(me.tenantId, me.userId, body);
  }

  @Get('period-lock')
  @Permissions('accounting.coa.manage')
  getLock(@CurrentUser() me: CurrentUserType) {
    return this.svc.getPeriodLock(me.tenantId);
  }

  @Delete('period-lock')
  @Permissions('accounting.coa.manage')
  clearLock(@CurrentUser() me: CurrentUserType) {
    return this.svc.clearPeriodLock(me.tenantId, me.userId);
  }

  @Get('reports/trial-balance')
@Permissions('accounting.read')
trialBalance(
  @CurrentUser() me: CurrentUserType,
  @Query('from') from: string,
  @Query('to') to: string,
) {
  return this.svc.trialBalance(me.tenantId, { from, to });
}

@Get('reports/general-ledger')
@Permissions('accounting.read')
generalLedger(
  @CurrentUser() me: CurrentUserType,
  @Query('accountCode') accountCode: string,
  @Query('from') from: string,
  @Query('to') to: string,
) {
  return this.svc.generalLedger(me.tenantId, { accountCode, from, to });
}

@Get('reports/balance-sheet')
@Permissions('accounting.read')
balanceSheet(
  @CurrentUser() me: CurrentUserType,
  @Query('asOf') asOf: string,
) {
  return this.svc.balanceSheet(me.tenantId, { asOf });
}

@Get('reports/profit-loss')
@Permissions('accounting.read')
profitLoss(
  @CurrentUser() me: CurrentUserType,
  @Query('from') from: string,
  @Query('to') to: string,
) {
  return this.svc.profitLoss(me.tenantId, { from, to });
}

@Post('period-close')
@Permissions('accounting.write')
periodClose(
  @CurrentUser() me: CurrentUserType,
  @Body() body: { from: string; to: string; retainedEarningsCode?: string; memo?: string },
) {
  return this.svc.periodClose(me.tenantId, body);
}


}
