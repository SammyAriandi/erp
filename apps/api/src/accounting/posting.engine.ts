import { BadRequestException } from '@nestjs/common';
import { Prisma, JournalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type JournalSource = {
  sourceType: string; // "SALES_INVOICE", "PURCHASE_INVOICE", etc
  sourceId: string;   // uuid of source doc
};

export type JournalLineInput = {
  accountId: string;
  debit?: string;   // string to avoid float
  credit?: string;
  description?: string;
};

export class PostingEngine {
  constructor(private readonly prisma: PrismaService) {}

  async postFromSource(args: {
    tenantId: string;
    userId: string;
    postingDate: string; // ISO
    memo?: string;
    source: JournalSource;
    lines: JournalLineInput[];
  }) {
    const postingDate = new Date(args.postingDate);
    if (isNaN(postingDate.getTime())) throw new BadRequestException('Invalid postingDate');
    if (!args.lines?.length) throw new BadRequestException('lines required');

    // idempotency: if already posted for this source, return it
    const existing = await this.prisma.journalEntry.findFirst({
      where: {
        tenantId: args.tenantId,
        sourceType: args.source.sourceType,
        sourceId: args.source.sourceId,
      },
      include: { lines: true },
    });
    if (existing) return existing;

    // validate + normalize lines
    const lineData: Prisma.JournalLineCreateManyJournalInput[] = [];
    for (const ln of args.lines) {
      const acc = await this.prisma.account.findFirst({
        where: { tenantId: args.tenantId, id: ln.accountId, isActive: true },
      });
      if (!acc) throw new BadRequestException(`accountId not found: ${ln.accountId}`);

      const debit = new Prisma.Decimal(ln.debit ?? '0');
      const credit = new Prisma.Decimal(ln.credit ?? '0');

      if (debit.isNegative() || credit.isNegative()) throw new BadRequestException('debit/credit cannot be negative');
      if (!debit.isZero() && !credit.isZero()) throw new BadRequestException('line cannot have both debit and credit');
      if (debit.isZero() && credit.isZero()) throw new BadRequestException('line must have debit or credit');

      lineData.push({
        tenantId: args.tenantId,
        accountId: ln.accountId,
        debit,
        credit,
        description: ln.description ?? null,
      });
    }

    // create draft with source reference
    const draft = await this.prisma.journalEntry.create({
      data: {
        tenantId: args.tenantId,
        postingDate,
        memo: args.memo ?? null,
        status: JournalStatus.DRAFT,
        sourceType: args.source.sourceType,
        sourceId: args.source.sourceId,
        lines: { create: lineData },
      },
      include: { lines: true },
    });

    // balance check before posting
    const totalDebit = draft.lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0));
    const totalCredit = draft.lines.reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Journal not balanced. debit=${totalDebit.toString()} credit=${totalCredit.toString()}`,
      );
    }

    // post it
    return this.prisma.journalEntry.update({
      where: { id: draft.id },
      data: {
        status: JournalStatus.POSTED,
        postedAt: new Date(),
        postedById: args.userId,
      },
      include: { lines: true },
    });
  }
}
