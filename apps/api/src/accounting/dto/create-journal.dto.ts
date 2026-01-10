export class CreateJournalLineDto {
  accountId!: string;
  debit?: string;  // use string to avoid float issues
  credit?: string;
  description?: string;
}

export class CreateJournalDto {
  postingDate!: string; // ISO date
  memo?: string;
  lines!: CreateJournalLineDto[];
}
