export type CoaRow = {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  parentCode?: string; // for hierarchy
};

export const COA_ID_V1: CoaRow[] = [
  // ===== ASSET (1xxxx) =====
  { code: '1000', name: 'ASET', type: 'ASSET' },

  { code: '1100', name: 'Aset Lancar', type: 'ASSET', parentCode: '1000' },
  { code: '1101', name: 'Kas', type: 'ASSET', parentCode: '1100' },
  { code: '1102', name: 'Bank', type: 'ASSET', parentCode: '1100' },
  { code: '1103', name: 'Piutang Usaha', type: 'ASSET', parentCode: '1100' },
  { code: '1104', name: 'Persediaan', type: 'ASSET', parentCode: '1100' },
  { code: '1105', name: 'Pajak Dibayar Dimuka', type: 'ASSET', parentCode: '1100' },

  { code: '1200', name: 'Aset Tetap', type: 'ASSET', parentCode: '1000' },
  { code: '1201', name: 'Peralatan & Mesin', type: 'ASSET', parentCode: '1200' },
  { code: '1202', name: 'Akumulasi Penyusutan', type: 'ASSET', parentCode: '1200' },

  // ===== LIABILITY (2xxxx) =====
  { code: '2000', name: 'KEWAJIBAN', type: 'LIABILITY' },
  { code: '2100', name: 'Kewajiban Lancar', type: 'LIABILITY', parentCode: '2000' },
  { code: '2101', name: 'Hutang Usaha', type: 'LIABILITY', parentCode: '2100' },
  { code: '2102', name: 'Hutang Pajak', type: 'LIABILITY', parentCode: '2100' },
  { code: '2103', name: 'Uang Muka Pelanggan', type: 'LIABILITY', parentCode: '2100' },

  // ===== EQUITY (3xxxx) =====
  { code: '3000', name: 'MODAL', type: 'EQUITY' },
  { code: '3101', name: 'Modal Disetor', type: 'EQUITY', parentCode: '3000' },
  { code: '3102', name: 'Laba Ditahan', type: 'EQUITY', parentCode: '3000' },
  { code: '3201', name: 'Prive / Dividen', type: 'EQUITY', parentCode: '3000' },

  // ===== INCOME (4xxxx) =====
  { code: '4000', name: 'PENDAPATAN', type: 'INCOME' },
  { code: '4100', name: 'Penjualan', type: 'INCOME', parentCode: '4000' },
  { code: '4101', name: 'Penjualan Produk', type: 'INCOME', parentCode: '4100' },
  { code: '4102', name: 'Penjualan Jasa', type: 'INCOME', parentCode: '4100' },
  { code: '4201', name: 'Pendapatan Lain-lain', type: 'INCOME', parentCode: '4000' },

  // ===== EXPENSE (5xxxx) =====
  { code: '5000', name: 'BEBAN', type: 'EXPENSE' },

  { code: '5100', name: 'HPP', type: 'EXPENSE', parentCode: '5000' },
  { code: '5101', name: 'Harga Pokok Penjualan', type: 'EXPENSE', parentCode: '5100' },

  { code: '5200', name: 'Beban Operasional', type: 'EXPENSE', parentCode: '5000' },
  { code: '5201', name: 'Gaji & Upah', type: 'EXPENSE', parentCode: '5200' },
  { code: '5202', name: 'Listrik, Air, Internet', type: 'EXPENSE', parentCode: '5200' },
  { code: '5203', name: 'Transportasi', type: 'EXPENSE', parentCode: '5200' },
  { code: '5204', name: 'Pemeliharaan', type: 'EXPENSE', parentCode: '5200' },
  { code: '5205', name: 'Beban Administrasi', type: 'EXPENSE', parentCode: '5200' },

  { code: '5301', name: 'Beban Pajak', type: 'EXPENSE', parentCode: '5000' },
];
