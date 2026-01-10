export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'INCOME'
  | 'EXPENSE';

export class CreateAccountDto {
  code!: string;
  name!: string;
  type!: AccountType;
  parentId?: string;
}
