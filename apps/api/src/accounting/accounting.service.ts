import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { COA_ID_V1 } from './coa.id';
import { PostingEngine } from './posting.engine';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AccountingService {
  private readonly engine: PostingEngine;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
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

    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException('lines required');
    }

    const lineData: Array<{
      tenantId: string;
      accountId: string;
      debit: Decimal;
      credit: Decimal;
      description?: string | null;
    }> = [];

    for (const ln of input.lines) {
      const account = await this.prisma.account.findFirst({
        where: { tenantId, id: ln.accountId, isActive: true },
      });
      if (!account) throw new BadRequestException(`accountId not found: ${ln.accountId}`);

      const debit = new Decimal(ln.debit ?? '0');
      const credit = new Decimal(ln.credit ?? '0');

      if (debit.isNegative() || credit.isNegative()) {
        throw new BadRequestException('debit/credit cannot be negative');
      }
      if (!debit.isZero() && !credit.isZero()) {
        throw new BadRequestException('line cannot have both debit and credit');
      }
      if (debit.isZero() && credit.isZero()) {
        throw new BadRequestException('line must have debit or credit');
      }

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

    // ✅ Period lock check
    const lock = await this.prisma.periodLock.findFirst({
      where: { tenantId, module: 'ACCOUNTING' },
    });
    if (lock && journal.postingDate <= lock.lockUntil) {
      throw new BadRequestException(
        `Accounting period locked until ${lock.lockUntil.toISOString()}`,
      );
    }

    // ✅ Balance check
    const totalDebit = journal.lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
    const totalCredit = journal.lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));

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

    // ✅ Audit (pakai AuditService supaya schema audit aman dari perubahan)
    await this.audit.log({
      tenantId,
      actorId: userId,
      action: 'JOURNAL_POSTED',
      entity: 'JournalEntry',
      entityId: posted.id,
      meta: {
        memo: posted.memo,
        postingDate: posted.postingDate.toISOString(),
        debit: totalDebit.toString(),
        credit: totalCredit.toString(),
        sourceType: (posted as any).sourceType ?? null,
        sourceId: (posted as any).sourceId ?? null,
      },
    });

    return posted;
  }

  // -------------------------
  // Posting Engine wrapper (auto posting from source)
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
  // COA bootstrap (Indonesia V1)
  // -------------------------
  async bootstrapCoaIdV1(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');

    if ((tenant as any).coaVersion === 'ID_V1') {
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
      data: { coaVersion: 'ID_V1' as any },
    });

    await this.audit.log({
      tenantId,
      actorId: null,
      action: 'ACCOUNTING_COA_BOOTSTRAPPED',
      entity: 'Tenant',
      entityId: tenantId,
      meta: { version: 'ID_V1' },
    });

    return { ok: true, msg: 'COA bootstrapped', version: 'ID_V1' };
  }

  // -------------------------
  // Period Lock (Accounting)
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

    await this.audit.log({
      tenantId,
      actorId,
      action: 'ACCOUNTING_LOCK_SET',
      entity: 'PeriodLock',
      entityId: lock.id,
      meta: { lockUntil: lock.lockUntil.toISOString(), reason: lock.reason },
    });

    return { ok: true, lock };
  }

  async clearPeriodLock(tenantId: string, actorId: string) {
    const lock = await this.prisma.periodLock.findFirst({
      where: { tenantId, module: 'ACCOUNTING' },
    });

    if (!lock) return { ok: true, msg: 'No lock to clear' };

    await this.prisma.periodLock.delete({ where: { id: lock.id } });

    await this.audit.log({
      tenantId,
      actorId,
      action: 'ACCOUNTING_LOCK_CLEARED',
      entity: 'PeriodLock',
      entityId: lock.id,
      meta: { lockUntil: lock.lockUntil.toISOString(), reason: lock.reason },
    });

    return { ok: true };
  }

async trialBalance(
  tenantId: string,
  input: { from: string; to: string },
) {
  const fromDate = new Date(input.from);
  const toDate = new Date(input.to);

  if (isNaN(fromDate.getTime())) throw new BadRequestException('Invalid from date');
  if (isNaN(toDate.getTime())) throw new BadRequestException('Invalid to date');
  if (fromDate > toDate) throw new BadRequestException('from must be <= to');

  // 1) Opening: all POSTED lines before fromDate
  const openingAgg = await this.prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      journal: {
        status: 'POSTED',
        postingDate: { lt: fromDate },
      },
    },
    _sum: { debit: true, credit: true },
  });

  // 2) Movement: all POSTED lines in [fromDate..toDate]
  const movementAgg = await this.prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      journal: {
        status: 'POSTED',
        postingDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { debit: true, credit: true },
  });

  const openingMap = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const r of openingAgg) {
    openingMap.set(r.accountId, {
      debit: r._sum.debit ?? new Decimal(0),
      credit: r._sum.credit ?? new Decimal(0),
    });
  }

  const moveMap = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const r of movementAgg) {
    moveMap.set(r.accountId, {
      debit: r._sum.debit ?? new Decimal(0),
      credit: r._sum.credit ?? new Decimal(0),
    });
  }

  // Accounts list (so we can show code/name/type + stable ordering)
  const accounts = await this.prisma.account.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });

  const zero = new Decimal(0);

  const splitNet = (net: Decimal) => {
    if (net.gt(zero)) return { debit: net, credit: zero };
    if (net.lt(zero)) return { debit: zero, credit: net.abs() };
    return { debit: zero, credit: zero };
  };

  const rows = accounts.map((acc) => {
    const open = openingMap.get(acc.id) ?? { debit: zero, credit: zero };
    const mov = moveMap.get(acc.id) ?? { debit: zero, credit: zero };

    const openingNet = open.debit.minus(open.credit);
    const openingSplit = splitNet(openingNet);

    const periodDebit = mov.debit;
    const periodCredit = mov.credit;

    const closingNet = openingNet.plus(periodDebit).minus(periodCredit);
    const closingSplit = splitNet(closingNet);

    return {
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,

      openingDebit: openingSplit.debit.toString(),
      openingCredit: openingSplit.credit.toString(),

      periodDebit: periodDebit.toString(),
      periodCredit: periodCredit.toString(),

      closingDebit: closingSplit.debit.toString(),
      closingCredit: closingSplit.credit.toString(),
    };
  });

  // totals (closing must balance)
  const totals = rows.reduce(
    (s, r) => {
      const od = new Decimal(r.openingDebit);
      const oc = new Decimal(r.openingCredit);
      const pd = new Decimal(r.periodDebit);
      const pc = new Decimal(r.periodCredit);
      const cd = new Decimal(r.closingDebit);
      const cc = new Decimal(r.closingCredit);

      return {
        openingDebit: s.openingDebit.plus(od),
        openingCredit: s.openingCredit.plus(oc),
        periodDebit: s.periodDebit.plus(pd),
        periodCredit: s.periodCredit.plus(pc),
        closingDebit: s.closingDebit.plus(cd),
        closingCredit: s.closingCredit.plus(cc),
      };
    },
    {
      openingDebit: zero,
      openingCredit: zero,
      periodDebit: zero,
      periodCredit: zero,
      closingDebit: zero,
      closingCredit: zero,
    },
  );

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    totals: {
      openingDebit: totals.openingDebit.toString(),
      openingCredit: totals.openingCredit.toString(),
      periodDebit: totals.periodDebit.toString(),
      periodCredit: totals.periodCredit.toString(),
      closingDebit: totals.closingDebit.toString(),
      closingCredit: totals.closingCredit.toString(),
    },
    rows,
  };
}

async generalLedger(
  tenantId: string,
  input: { accountCode: string; from: string; to: string },
) {
  const { accountCode } = input;

  if (!accountCode) throw new BadRequestException('accountCode is required');

  const fromDate = new Date(input.from);
  const toDate = new Date(input.to);

  if (isNaN(fromDate.getTime())) throw new BadRequestException('Invalid from date');
  if (isNaN(toDate.getTime())) throw new BadRequestException('Invalid to date');
  if (fromDate > toDate) throw new BadRequestException('from must be <= to');

  // 1) Resolve account by code (tenant scoped)
  const account = await this.prisma.account.findFirst({
    where: { tenantId, code: accountCode },
  });

  if (!account) throw new NotFoundException(`Account not found: ${accountCode}`);

  // Helper: split net (debit-credit) into {debit, credit}
  const zero = new Decimal(0);
  const splitNet = (net: Decimal) => {
    if (net.gt(zero)) return { debit: net, credit: zero };
    if (net.lt(zero)) return { debit: zero, credit: net.abs() };
    return { debit: zero, credit: zero };
  };

  // 2) Opening = sum(lines before fromDate)
  const openAgg = await this.prisma.journalLine.aggregate({
    where: {
      tenantId,
      accountId: account.id,
      journal: { status: 'POSTED', postingDate: { lt: fromDate } },
    },
    _sum: { debit: true, credit: true },
  });

  const openingDebit = openAgg._sum.debit ?? new Decimal(0);
  const openingCredit = openAgg._sum.credit ?? new Decimal(0);
  const openingNet = openingDebit.minus(openingCredit);
  const openingSplit = splitNet(openingNet);

  // 3) Transactions in range
  const lines = await this.prisma.journalLine.findMany({
    where: {
      tenantId,
      accountId: account.id,
      journal: {
  status: 'POSTED',
  postingDate: { gte: fromDate, lte: toDate },
  NOT: { sourceType: 'PERIOD_CLOSE' },
},
    },
    include: {
      journal: true,
    },
    orderBy: [
      { journal: { postingDate: 'asc' } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });

  // 4) Running balance
  let runningNet = openingNet;

  const transactions = lines.map((l) => {
    const d = l.debit ?? new Decimal(0);
    const c = l.credit ?? new Decimal(0);
    runningNet = runningNet.plus(d).minus(c);
    const runningSplit = splitNet(runningNet);

    return {
      postingDate: l.journal.postingDate.toISOString(),
      journalId: l.journalId,
      journalStatus: l.journal.status, // should be POSTED
      memo: l.journal.memo ?? null,
      lineDescription: l.description ?? null,

      debit: d.toString(),
      credit: c.toString(),

      runningDebit: runningSplit.debit.toString(),
      runningCredit: runningSplit.credit.toString(),
      runningNet: runningNet.toString(),
    };
  });

  // 5) Closing = opening + movements
  const movAgg = await this.prisma.journalLine.aggregate({
    where: {
      tenantId,
      accountId: account.id,
      journal: {
  status: 'POSTED',
  postingDate: { gte: fromDate, lte: toDate },
  NOT: { sourceType: 'PERIOD_CLOSE' },
},
    },
    _sum: { debit: true, credit: true },
  });

  const periodDebit = movAgg._sum.debit ?? new Decimal(0);
  const periodCredit = movAgg._sum.credit ?? new Decimal(0);
  const closingNet = openingNet.plus(periodDebit).minus(periodCredit);
  const closingSplit = splitNet(closingNet);

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
    },
    from: fromDate.toISOString(),
    to: toDate.toISOString(),

    opening: {
      debit: openingSplit.debit.toString(),
      credit: openingSplit.credit.toString(),
      net: openingNet.toString(),
    },

    period: {
      debit: periodDebit.toString(),
      credit: periodCredit.toString(),
    },

    closing: {
      debit: closingSplit.debit.toString(),
      credit: closingSplit.credit.toString(),
      net: closingNet.toString(),
    },

    transactions,
  };
}

async balanceSheet(tenantId: string, input: { asOf: string }) {
  const asOfDate = new Date(input.asOf);
  if (isNaN(asOfDate.getTime())) throw new BadRequestException('Invalid asOf date');

  const zero = new Decimal(0);

  // Closing as-of = sum of all POSTED lines <= asOf
  const agg = await this.prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      journal: { status: 'POSTED', postingDate: { lte: asOfDate } },
    },
    _sum: { debit: true, credit: true },
  });

  const sumMap = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const r of agg) {
    sumMap.set(r.accountId, {
      debit: r._sum.debit ?? zero,
      credit: r._sum.credit ?? zero,
    });
  }

  const accounts = await this.prisma.account.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ code: 'asc' }],
  });

  const accById = new Map(accounts.map((a) => [a.id, a]));
  const childrenByParent = new Map<string | null, string[]>();
  for (const a of accounts) {
    const key = a.parentId ?? null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(a.id);
  }

  // Normalized balance:
  // - ASSET: debit-credit (positive means asset)
  // - LIABILITY/EQUITY: credit-debit (positive means liability/equity)
  const normalized = (a: { type: string }, s: { debit: Decimal; credit: Decimal }) => {
    const netDebit = s.debit.minus(s.credit);
    if (a.type === 'ASSET') return netDebit; // debit-normal
    if (a.type === 'LIABILITY' || a.type === 'EQUITY') return netDebit.negated(); // credit-normal
    return zero;
  };

  const computeNode = (id: string): any => {
    const a = accById.get(id)!;
    const kids = childrenByParent.get(id) ?? [];
    const selfSum = sumMap.get(id) ?? { debit: zero, credit: zero };
    const selfVal = normalized(a, selfSum);

    const childNodes = kids.map(computeNode);
    const childrenTotal = childNodes.reduce((t: Decimal, n: any) => t.plus(new Decimal(n.total)), zero);

    const total = selfVal.plus(childrenTotal);

    return {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      // for leaf accounts, self may be non-zero; for parent headings, self likely zero
      self: selfVal.toString(),
      total: total.toString(),
      children: childNodes,
    };
  };

  const roots = childrenByParent.get(null) ?? [];
  const assetRoots = roots.filter((id) => accById.get(id)!.type === 'ASSET');
  const liabRoots = roots.filter((id) => accById.get(id)!.type === 'LIABILITY');
  const equityRoots = roots.filter((id) => accById.get(id)!.type === 'EQUITY');

  const assets = assetRoots.map(computeNode);
  const liabilities = liabRoots.map(computeNode);
  const equity = equityRoots.map(computeNode);

  const sumSection = (nodes: any[]) =>
    nodes.reduce((t: Decimal, n: any) => t.plus(new Decimal(n.total)), zero);

  const totalAssets = sumSection(assets);
  const totalLiabilities = sumSection(liabilities);
  const totalEquity = sumSection(equity);

  const totalLE = totalLiabilities.plus(totalEquity);
  const difference = totalAssets.minus(totalLE);

  return {
    asOf: asOfDate.toISOString(),
    totals: {
      assets: totalAssets.toString(),
      liabilities: totalLiabilities.toString(),
      equity: totalEquity.toString(),
      liabilitiesPlusEquity: totalLE.toString(),
      difference: difference.toString(), // should be "0" when balanced
    },
    sections: { assets, liabilities, equity },
  };
}

async profitLoss(tenantId: string, input: { from: string; to: string }) {
  const fromDate = new Date(input.from);
  const toDate = new Date(input.to);

  if (isNaN(fromDate.getTime())) throw new BadRequestException('Invalid from date');
  if (isNaN(toDate.getTime())) throw new BadRequestException('Invalid to date');
  if (fromDate > toDate) throw new BadRequestException('from must be <= to');

  const zero = new Decimal(0);

  const accounts = await this.prisma.account.findMany({
    where: { tenantId, isActive: true, type: { in: ['INCOME', 'EXPENSE'] } },
    orderBy: [{ code: 'asc' }],
  });

  const ids = accounts.map((a) => a.id);

  const agg = await this.prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      accountId: { in: ids },
      journal: { 
        status: 'POSTED', 
        postingDate: { gte: fromDate, lte: toDate },
        NOT: { sourceType: 'PERIOD_CLOSE' },
      },
    },
    _sum: { debit: true, credit: true },
  });

  const sumMap = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const r of agg) {
    sumMap.set(r.accountId, {
      debit: r._sum.debit ?? zero,
      credit: r._sum.credit ?? zero,
    });
  }

  // Normalize:
  // - INCOME: credit - debit (positive means revenue)
  // - EXPENSE: debit - credit (positive means expense)
  const row = (a: any) => {
    const s = sumMap.get(a.id) ?? { debit: zero, credit: zero };
    const val =
      a.type === 'INCOME'
        ? s.credit.minus(s.debit)
        : s.debit.minus(s.credit);

    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: s.debit.toString(),
      credit: s.credit.toString(),
      amount: val.toString(),
    };
  };

  const rows = accounts.map(row);
  const incomeTotal = rows
    .filter((r) => r.type === 'INCOME')
    .reduce((t, r) => t.plus(new Decimal(r.amount)), zero);

  const expenseTotal = rows
    .filter((r) => r.type === 'EXPENSE')
    .reduce((t, r) => t.plus(new Decimal(r.amount)), zero);

  const netProfit = incomeTotal.minus(expenseTotal);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    totals: {
      income: incomeTotal.toString(),
      expense: expenseTotal.toString(),
      netProfit: netProfit.toString(),
    },
    rows,
  };
}

async periodClose(
  tenantId: string,
  input: { from: string; to: string; retainedEarningsCode?: string; memo?: string },
) {
  const fromDate = new Date(input.from);
  const toDate = new Date(input.to);
  if (isNaN(fromDate.getTime())) throw new BadRequestException('Invalid from date');
  if (isNaN(toDate.getTime())) throw new BadRequestException('Invalid to date');
  if (fromDate > toDate) throw new BadRequestException('from must be <= to');

  const retainedCode = (input.retainedEarningsCode ?? '3102').trim();

  const retained = await this.prisma.account.findFirst({
    where: { tenantId, code: retainedCode, isActive: true },
  });
  if (!retained) throw new BadRequestException(`Retained earnings account not found: ${retainedCode}`);

  const zero = new Decimal(0);
  const sourceId = `${input.from}..${input.to}`;
  const existing = await this.prisma.journalEntry.findFirst({
  where: {
    tenantId,
    sourceType: 'PERIOD_CLOSE',
    sourceId,
    status: 'POSTED',
  },
});
if (existing) {
  throw new BadRequestException('Period already closed for this range');
}
  // Ambil saldo periode untuk akun income/expense
const accs = await this.prisma.account.findMany({
  where: {
    tenantId,
    isActive: true,
    type: { in: ['INCOME', 'EXPENSE'] },
  },
  orderBy: { code: 'asc' },
});

const parents = new Set(accs.map(a => a.parentId).filter(Boolean) as string[]);
const leafAccs = accs.filter(a => !parents.has(a.id));


const ids = leafAccs.map(a => a.id); // atau accs.map(a => a.id)

const agg = await this.prisma.journalLine.groupBy({
  by: ['accountId'],
  where: {
    tenantId,
    accountId: { in: ids },
    journal: {
  status: 'POSTED',
  postingDate: { gte: fromDate, lte: toDate },
  NOT: { sourceType: 'PERIOD_CLOSE' },
},
  },
  _sum: { debit: true, credit: true },
});


  const sumMap = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const r of agg) {
    sumMap.set(r.accountId, {
      debit: r._sum.debit ?? zero,
      credit: r._sum.credit ?? zero,
    });
  }

  // Buat lines closing:
  // INCOME => debit sebesar (credit - debit) kalau positif
  // EXPENSE => credit sebesar (debit - credit) kalau positif
  const lines: Array<{ accountId: string; debit: Decimal; credit: Decimal; description?: string | null }> = [];

  let incomeTotal = zero;
  let expenseTotal = zero;

  for (const a of leafAccs) {
    const s = sumMap.get(a.id) ?? { debit: zero, credit: zero };

    if (a.type === 'INCOME') {
      const amount = s.credit.minus(s.debit);
      if (amount.greaterThan(zero)) {
        lines.push({
          accountId: a.id,
          debit: amount,
          credit: zero,
          description: `Close income ${a.code} ${a.name}`,
        });
        incomeTotal = incomeTotal.plus(amount);
      }
    }

    if (a.type === 'EXPENSE') {
      const amount = s.debit.minus(s.credit);
      if (amount.greaterThan(zero)) {
        lines.push({
          accountId: a.id,
          debit: zero,
          credit: amount,
          description: `Close expense ${a.code} ${a.name}`,
        });
        expenseTotal = expenseTotal.plus(amount);
      }
    }
  }

  const netProfit = incomeTotal.minus(expenseTotal);

  if (lines.length === 0) {
    throw new BadRequestException('Nothing to close in this period');
  }

  // Balancing line ke Retained Earnings
  if (netProfit.greaterThan(zero)) {
    // Profit => credit retained
    lines.push({
      accountId: retained.id,
      debit: zero,
      credit: netProfit,
      description: 'Close to retained earnings (profit)',
    });
  } else if (netProfit.lessThan(zero)) {
    // Loss => debit retained
    lines.push({
      accountId: retained.id,
      debit: netProfit.negated(),
      credit: zero,
      description: 'Close to retained earnings (loss)',
    });
  } else {
    // net 0 => tidak perlu retained line
  }

  // Create journal draft dulu
const journal = await this.prisma.journalEntry.create({
  data: {
    tenantId,
    postingDate: toDate,
    memo: input.memo ?? `Period close ${input.from}..${input.to}`,
    status: 'DRAFT',
    sourceType: 'PERIOD_CLOSE',
    sourceId: `${input.from}..${input.to}`,
    lines: {
      create: lines.map((l) => ({
        tenantId,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? null,
      })),
    },
  },
  include: { lines: true },
});

const posted = await this.prisma.journalEntry.update({
  where: { id: journal.id },
  data: { status: 'POSTED', postedAt: new Date() },
  include: { lines: true },
});
}


}
