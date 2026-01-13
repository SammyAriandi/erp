import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COA_ID_V1 } from './coa.id';
import { PostingEngine } from './posting.engine';

@Injectable()
export class AccountingService {
  private readonly engine: PostingEngine;

  constructor(private readonly prisma: PrismaService) {
    this.engine = new PostingEngine(prisma);
  }

  // -------------------------
  // Accounts (COA)
  // -------------------------
  async createAccount(
    tenantId: string,
    input: { code: string; name: string; type: any; parentId?: string },
  ) {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) throw new BadRequestException('code and name are required');

    if (input.parentId) {
      const parent = await this.prisma.account.findFirst({
        where: { tenantId, id: input.parentId },
      });
      if (!parent) throw new BadRequestException('parentId not found');
    }

    return this.prisma.account.create({
      data: {
        tenantId,
        code,
        name,
        type: input.type,
        parentId: input.parentId ?? null,
      },
    });
  }

  async listAccounts(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
  }

  // -------------------------
  // Journals (manual)
  // -------------------------
  async createJournalDraft(
    tenantId: string,
    userId: string,
    input: { postingDate: string; memo?: string; lines: any[] },
  ) {
    const postingDate = new Date(input.postingDate);
    if (isNaN(postingDate.getTime())) throw new BadRequestException('Invalid postingDate');

    if (!input.lines || input.lines.length === 0) throw new BadRequestException('lines required');

    const lineData: Prisma.JournalLineCreateManyJournalInput[] = [];

    for (const ln of input.lines) {
      const account = await this.prisma.account.findFirst({
        where: { tenantId, id: ln.accountId, isActive: true },
      });
      if (!account) throw new BadRequestException(`accountId not found: ${ln.accountId}`);

      const debit = new Prisma.Decimal(ln.debit ?? '0');
      const credit = new Prisma.Decimal(ln.credit ?? '0');

      if (debit.isNegative() || credit.isNegative())
        throw new BadRequestException('debit/credit cannot be negative');
      if (!debit.isZero() && !credit.isZero())
        throw new BadRequestException('line cannot have both debit and credit');
      if (debit.isZero() && credit.isZero())
        throw new BadRequestException('line must have debit or credit');

      lineData.push({
        tenantId,
        accountId: ln.accountId,
        debit,
        credit,
        description: ln.description ?? null,
      });
    }

    return this.prisma.journalEntry.create({
      data: {
        tenantId,
        postingDate,
        memo: input.memo ?? null,
        status: 'DRAFT',
        lines: { create: lineData.map((l) => ({ ...l })) },
      },
      include: { lines: true },
    });
  }

  async postJournal(tenantId: string, userId: string, journalId: string) {
    const journal = await this.prisma.journalEntry.findFirst({
      where: { tenantId, id: journalId },
      include: { lines: true },
    });
    if (!journal) throw new NotFoundException('Journal not found');
    if (journal.status !== 'DRAFT') throw new BadRequestException('Only DRAFT can be posted');

    // ✅ Period lock check (Accounting)
    const lock = await this.prisma.periodLock.findFirst({
      where: { tenantId, module: 'ACCOUNTING' },
    });
    if (lock && journal.postingDate <= lock.lockUntil) {
      throw new BadRequestException(
        `Accounting period locked until ${lock.lockUntil.toISOString()}`,
      );
    }

    // ✅ Balance check
    const totalDebit = journal.lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0));
    const totalCredit = journal.lines.reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Journal not balanced. debit=${totalDebit.toString()} credit=${totalCredit.toString()}`,
      );
    }

    // ✅ Post journal
    const posted = await this.prisma.journalEntry.update({
      where: { id: journalId },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
        postedById: userId,
      },
      include: { lines: true },
    });

    // ✅ Audit trail
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        action: 'JOURNAL_POSTED',
        entityType: 'JournalEntry',
        entityId: posted.id,
        meta: {
          memo: posted.memo,
          postingDate: posted.postingDate.toISOString(),
          debit: totalDebit.toString(),
          credit: totalCredit.toString(),
          sourceType: (posted as any).sourceType ?? null,
          sourceId: (posted as any).sourceId ?? null,
        },
      },
    });

    return posted;
  }

  // -------------------------
  // ✅ STEP 4.3C — Wrapper for Posting Engine (for Sales/Purchase/Inventory later)
  // -------------------------
  async postFromSource(
    tenantId: string,
    userId: string,
    input: {
      postingDate: string;
      memo?: string;
      sourceType: string;
      sourceId: string;
      lines: { accountId: string; debit?: string; credit?: string; description?: string }[];
    },
  ) {
    return this.engine.postFromSource({
      tenantId,
      userId,
      postingDate: input.postingDate,
      memo: input.memo,
      source: { sourceType: input.sourceType, sourceId: input.sourceId },
      lines: input.lines,
    });
  }

  // -------------------------
  // ✅ STEP 4.2 — COA bootstrap (Indonesia V1)
  // -------------------------
  async bootstrapCoaIdV1(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');

    if (tenant.coaVersion === 'ID_V1') {
      return { ok: true, msg: 'COA already bootstrapped', version: 'ID_V1' };
    }

    const codeToId = new Map<string, string>();

    for (const row of COA_ID_V1) {
      const parentId = row.parentCode ? codeToId.get(row.parentCode) ?? null : null;

      const acc = await this.prisma.account.upsert({
        where: { tenantId_code: { tenantId, code: row.code } },
        update: {
          name: row.name,
          type: row.type as any,
          parentId,
          isActive: true,
        },
        create: {
          tenantId,
          code: row.code,
          name: row.name,
          type: row.type as any,
          parentId,
          isActive: true,
        },
      });

      codeToId.set(row.code, acc.id);
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { coaVersion: 'ID_V1' },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: null,
        action: 'ACCOUNTING_COA_BOOTSTRAPPED',
        entityType: 'Tenant',
        entityId: tenantId,
        meta: { version: 'ID_V1' },
      },
    });

    return { ok: true, msg: 'COA bootstrapped', version: 'ID_V1' };
  }

  // -------------------------
  // ✅ STEP 4.4 — Period Lock (Accounting)
  // -------------------------
  async getPeriodLock(tenantId: string) {
    return this.prisma.periodLock.findFirst({
      where: { tenantId, module: 'ACCOUNTING' },
    });
  }

  async setPeriodLock(
    tenantId: string,
    actorId: string,
    input: { lockUntil: string; reason?: string },
  ) {
    const lockUntil = new Date(input.lockUntil);
    if (isNaN(lockUntil.getTime())) throw new BadRequestException('Invalid lockUntil');

    const lock = await this.prisma.periodLock.upsert({
      where: { tenantId_module: { tenantId, module: 'ACCOUNTING' } },
      update: { lockUntil, reason: input.reason ?? null, createdById: actorId },
      create: {
        tenantId,
        module: 'ACCOUNTING',
        lockUntil,
        reason: input.reason ?? null,
        createdById: actorId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'ACCOUNTING_LOCK_SET',
        entityType: 'PeriodLock',
        entityId: lock.id,
        meta: { lockUntil: lock.lockUntil.toISOString(), reason: lock.reason },
      },
    });

    return { ok: true, lock };
  }

  async clearPeriodLock(tenantId: string, actorId: string) {
    const lock = await this.prisma.periodLock.findFirst({
      where: { tenantId, module: 'ACCOUNTING' },
    });

    if (!lock) return { ok: true, msg: 'No lock to clear' };

    await this.prisma.periodLock.delete({ where: { id: lock.id } });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'ACCOUNTING_LOCK_CLEARED',
        entityType: 'PeriodLock',
        entityId: lock.id,
        meta: { lockUntil: lock.lockUntil.toISOString(), reason: lock.reason },
      },
    });

    return { ok: true };
  }
}
