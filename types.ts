
export interface BankProfile {
  id: string;
  name: string;
  columns: string[];
  currencySymbol: string;
  identifiers?: string[];
  dueDateKeywords?: string;
  closingDateKeywords?: string; // Nueva frase clave para detectar fecha de cierre
}

export enum TransactionType {
  PURCHASE = 'PURCHASE',
  INSTALLMENT = 'INSTALLMENT',
  TAX_FEE = 'TAX_FEE',
  PAYMENT = 'PAYMENT',
  OTHER = 'OTHER'
}

export interface Transaction {
  id: string;
  date: string;
  detail: string;
  amount: number;
  originalAmount?: number;
  type: TransactionType;
  isInstallment: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentsRemaining?: number;
  bankName?: string;
  explanation?: string;
  targetPeriod?: string; // Periodo al que pertenece (ej: "2024-03")
  isPostClosing?: boolean; // Indica si ocurrió después del cierre
  statementClosingDate?: string; // Fecha de cierre original del resumen
  statementDueDate?: string; // Fecha de vencimiento original del resumen
  children?: Transaction[];
}

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
}

export interface ProcessedResult {
  rawTransactions: Transaction[];
  groupedTransactions: Transaction[];
  summary: {
    total: number;
    totalUSD: number;
    totalInstallments: number;
    totalTaxes: number;
  };
}

export interface BillExtractionResult {
  serviceName: string;
  date: string;
  amount: number;
  currency: string;
  confidence: string;
  foundKeywords: string[];
}

export type AppView = 'HOME' | 'BANKS' | 'RESULTS' | 'DASHBOARD' | 'BALANCE' | 'SETTINGS';
