
import { Transaction, BankProfile, TransactionType, FixedExpense } from "../types";

// URL del Web App de Google Apps Script
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzYZZpoQc7rj7lp2sIgmYsog3_PkB6eq7eKjpzkI9128Bwcd0C6RhhgRH1vIw3Z2wVh/exec"; 

const postToSheet = async (payload: any) => {
  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.status === 'error') {
        throw new Error(result.message || "Error desconocido en el Script");
    }
    return result;
  } catch (e) {
    console.error("Sheet Service Connectivity Error:", e);
    return { 
        status: 'error', 
        message: "Error de conexión con Google Sheets." 
    };
  }
};

export const saveToGoogleSheets = async (transactions: Transaction[], bankName: string): Promise<boolean> => {
  const importDate = new Date().toISOString().split('T')[0];
  const rows = transactions.map(tx => ({
    id: tx.id,
    fecha: tx.date,
    detalle: tx.detail,
    monto: tx.amount,
    banco: bankName,
    tipo: tx.type,
    cuota_actual: tx.installmentCurrent || 1,
    cuota_total: tx.installmentTotal || 1,
    periodo_destino: tx.targetPeriod || tx.date?.substring(0, 7),
    post_cierre: tx.isPostClosing ? 1 : 0,
    fecha_cierre: tx.statementClosingDate || '',
    fecha_vencimiento: tx.statementDueDate || '',
    fecha_importacion: importDate
  }));

  const res = await postToSheet({ action: 'save_transactions', data: rows });
  return res.status === 'success';
};

export const saveBanksToGoogleSheets = async (banks: BankProfile[]): Promise<boolean> => {
  const bankRows = banks.map(b => ({
    id: b.id,
    name: b.name,
    columns: b.columns.join(', '),
    currency: b.currencySymbol,
    identifiers: b.identifiers ? b.identifiers.join('||') : '',
    dueDateKeywords: b.dueDateKeywords || '',
    closingDateKeywords: b.closingDateKeywords || ''
  }));
  const res = await postToSheet({ action: 'save_banks', data: bankRows });
  return res.status === 'success';
};

export const fetchBanksFromSheets = async (): Promise<BankProfile[]> => {
  const res = await postToSheet({ action: 'get_banks' });
  return res.status === 'success' ? res.data.map((row: any[]) => ({
    id: row[0], 
    name: row[1], 
    columns: row[2] ? String(row[2]).split(',').map(s => s.trim()) : [], 
    currencySymbol: row[3], 
    identifiers: row[4] ? String(row[4]).split('||').map(s => s.trim()) : [], 
    dueDateKeywords: row[5] || '',
    closingDateKeywords: row[6] || ''
  })) : [];
};

export const fetchTransactionsFromSheets = async (): Promise<Transaction[]> => {
  const res = await postToSheet({ action: 'get_transactions' });
  return res.status === 'success' ? res.data.map((row: any[]) => ({
    id: row[0], 
    date: row[1] ? new Date(row[1]).toISOString().split('T')[0] : '', 
    detail: row[2], 
    amount: parseFloat(row[3]), 
    bankName: row[4], 
    type: row[5] as TransactionType, 
    isInstallment: parseInt(row[7]) > 1, 
    installmentCurrent: parseInt(row[6]), 
    installmentTotal: parseInt(row[7]), 
    installmentsRemaining: parseInt(row[7]) - parseInt(row[6]),
    // Estandarizar a YYYY-MM para que el dashboard no calcule desfases por días extra
    targetPeriod: row[8] ? String(row[8]).substring(0, 7) : '',
    isPostClosing: parseInt(row[9]) === 1,
    statementClosingDate: row[10] || '',
    statementDueDate: row[11] || ''
  })) : [];
};

export const saveFixedExpensesToSheets = async (expenses: FixedExpense[]): Promise<void> => {
  const rows = expenses.map(e => ({ id: e.id, nombre: e.name, monto: e.amount }));
  await postToSheet({ action: 'save_fixed_expenses', data: rows });
};

export const fetchFixedExpensesFromSheets = async (): Promise<FixedExpense[]> => {
  const res = await postToSheet({ action: 'get_fixed_expenses' });
  return res.status === 'success' ? res.data.map((r: any[]) => ({ id: r[0], name: r[1], amount: parseFloat(r[2]) })) : [];
};

export const saveIncomeToSheets = async (amount: number): Promise<void> => {
  await postToSheet({ action: 'save_income', data: amount });
};

export const fetchIncomeFromSheets = async (): Promise<number> => {
  const res = await postToSheet({ action: 'get_income' });
  return res.status === 'success' ? parseFloat(res.data) : 0;
};
