import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { COA_ID_V1 } from './coa.id';
import { PostingEngine } from './posting.engine';

@Injectable()
export class AccountingService {
  private readonly engine: PostingEngine;

  constructor(private readonly prisma: PrismaService) {
    this.engine = new PostingEngine(prisma);
  }

  async createAccount(tenantId: string, input: { code: string; name: string; type: any; parentId?: string }) {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) throw new BadRequestException('code and name are required');

    if (input.parentId) {
      const parent = await this.prisma.account.findFirst({ where: { tenantId, id: input.parentId } });
      if (!parent) throw new BadRequestException('parentId not found');
    }

    return this.prisma.account.create({
      data: { tenantId, code, name, type: input.type, parentId: input.parentId ?? null },
    });
  }

  async listAccounts(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
  }

  async createJournalDraft(tenantId: string, userId: string, input: { postingDate: string; memo?: string; lines: any[] }) {
    const postingDate = new Date(input.postingDate);
    if (isNaN(postingDate.getTime())) throw new BadRequestException('Invalid postingDate');

    if (!input.lines || input.lines.length === 0) throw new BadRequestException('lines required');

    // Validate accounts belong to tenant, and normalize decimals
    const lineData: Prisma.JournalLineCreateManyJournalInput[] = [];

    for (const ln of input.lines) {
      const account = await this.prisma.account.findFirst({ where: { tenantId, id: ln.accountId, isActive: true } });
      if (!account) throw new BadRequestException(`accountId not found: ${ln.accountId}`);

      const debit = new Prisma.Decimal(ln.debit ?? '0');
      const credit = new Prisma.Decimal(ln.credit ?? '0');

      if (debit.isNegative() || credit.isNegative()) throw new BadRequestException('debit/credit cannot be negative');
      if (!debit.isZero() && !credit.isZero()) throw new BadRequestException('line cannot have both debit and credit');
      if (debit.isZero() && credit.isZero()) throw new BadRequestException('line must have debit or credit');

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
        lines: { create: lineData.map(l => ({ ...l })) },
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

    const totalDebit = journal.lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0));
    const totalCredit = journal.lines.reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(`Journal not balanced. debit=${totalDebit.toString()} credit=${totalCredit.toString()}`);
    }

    return this.prisma.journalEntry.update({
      where: { id: journalId },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
        postedById: userId,
      },
      include: { lines: true },
    });
  }
  async bootstrapCoaIdV1(tenantId: string) {
    // Already bootstrapped?
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');
    if (tenant.coaVersion === 'ID_V1') {
      return { ok: true, msg: 'COA already bootstrapped', version: 'ID_V1' };
    }

    // Build map for parent resolution
    const codeToId = new Map<string, string>();

    // Create in order (parent first)
    for (const row of COA_ID_V1) {
      const parentId = row.parentCode ? codeToId.get(row.parentCode) ?? null : null;

      // Upsert by (tenantId, code) — safe re-run
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

    return { ok: true, msg: 'COA bootstrapped', version: 'ID_V1' };
  }
}
