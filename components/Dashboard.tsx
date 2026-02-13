
import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, TransactionType, ProcessedResult } from '../types';
import { Wallet, CreditCard, DollarSign, Layers, Filter, Calendar, Sparkles, XCircle, History, TrendingUp, MousePointerClick, Info, AlertCircle, Loader2, CalendarDays, ArrowRightCircle, Landmark, PieChart, Clock, CalendarCheck, Search, X, FilterX } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ResultsTable from './ResultsTable';

// --- LÓGICA COMPARTIDA DE PROCESAMIENTO ---
export const PAYMENT_KEYWORDS = ['SU PAGO', 'PAGO EN PESOS', 'PAGO DE TARJETA', 'PAGO DE T', 'PAGO USD', 'PAGO $', 'PAGO CAJERO'];
export const EXCLUDE_PAYMENT_KEYWORDS = ['PAGO MIS CUENTAS', 'PAGO DE SERVICIOS', 'PAGO SERVICIOS', 'PAGO AFIP', 'PAGO BANCO'];

export const isActuallyAPayment = (t: Transaction) => {
    const detailUpper = t.detail.toUpperCase();
    const hasPaymentKeyword = PAYMENT_KEYWORDS.some(k => detailUpper.includes(k));
    const hasExcludeKeyword = EXCLUDE_PAYMENT_KEYWORDS.some(k => detailUpper.includes(k));
    return (t.type === TransactionType.PAYMENT || (hasPaymentKeyword && !hasExcludeKeyword)) && !detailUpper.includes('REVERSION');
};

export const getCleanTransactions = (txs: Transaction[]) => {
    const seen = new Set();
    return txs.filter(t => {
        if (isActuallyAPayment(t)) return false;
        const key = `${t.date}-${t.detail}-${t.amount}-${t.bankName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/**
 * Estandariza el periodo a YYYY-MM para evitar errores de comparación
 * con fechas completas provenientes de Sheets (ej: 2026-02-01 -> 2026-02)
 */
export const getStatementPeriod = (t: Transaction) => {
  const raw = t.targetPeriod || t.date || '';
  if (!raw || raw === 'Unknown') return 'Unknown';
  return raw.substring(0, 7);
};

export const getMonthDifference = (date1: Date, date2: Date) => {
  return (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth());
};

const formatMonthYear = (date: Date) => {
    const label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
};

const PASTEL_COLORS = [
  'bg-blue-50 border-blue-100 text-blue-700',
  'bg-indigo-50 border-indigo-100 text-indigo-700',
  'bg-emerald-50 border-emerald-100 text-emerald-700',
  'bg-rose-50 border-rose-100 text-rose-700',
  'bg-amber-50 border-amber-100 text-amber-700',
  'bg-violet-50 border-violet-100 text-violet-700',
];

/** 
 * Parser de fecha seguro que evita el desplazamiento por zona horaria
 */
const parseSafeDate = (dateStr: string | undefined): Date | null => {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') return null;
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
};

interface DashboardProps {
  transactions: Transaction[];
  isLoading: boolean;
  isVisible?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, isLoading, isVisible = true }) => {
  const [selectedBank, setSelectedBank] = useState<string>('all');
  const [selectedPeriodState, setSelectedPeriodState] = useState<string>(''); 
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'PROJECTION' | 'HISTORY'>('HISTORY');
  const [shouldRenderChart, setShouldRenderChart] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const uniqueTransactions = useMemo(() => getCleanTransactions(transactions), [transactions]);

  const bankFilteredTransactions = useMemo(() => {
    if (selectedBank === 'all') return uniqueTransactions;
    return uniqueTransactions.filter(t => t.bankName === selectedBank);
  }, [uniqueTransactions, selectedBank]);

  const availablePeriods = useMemo(() => {
    const periods = new Set(bankFilteredTransactions.map(t => getStatementPeriod(t)));
    return Array.from(periods).filter(p => p !== 'Unknown').sort().reverse();
  }, [bankFilteredTransactions]);

  const availableProjectionPeriods = useMemo(() => {
    const latestMonthKey = availablePeriods[0];
    if (!latestMonthKey) return [];
    const [y, m] = latestMonthKey.split('-').map(Number);
    const baseDate = new Date(y, m - 1, 1);
    const results = [];
    results.push({ key: latestMonthKey, label: `ACTUAL (${baseDate.toLocaleDateString('es-ES', { month: 'short' })})`, isBase: true });
    for (let i = 1; i <= 36; i++) {
        const futureDate = new Date(baseDate);
        futureDate.setMonth(baseDate.getMonth() + i);
        const key = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
        const hasData = bankFilteredTransactions.some(t => {
            if (!t.isInstallment) return false;
            const txPeriod = getStatementPeriod(t);
            const [oy, om] = txPeriod.split('-').map(Number);
            const txBaseDate = new Date(oy, om - 1, 1);
            const diff = getMonthDifference(txBaseDate, futureDate);
            return diff > 0 && (t.installmentCurrent || 1) + diff <= (t.installmentTotal || 1);
        });
        if (hasData) results.push({ key, label: futureDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }), isBase: false });
    }
    return results;
  }, [availablePeriods, bankFilteredTransactions]);

  const activePeriod = useMemo(() => {
    if (selectedPeriodState) {
        const list = chartMode === 'HISTORY' ? availablePeriods : availableProjectionPeriods.map(p => p.key);
        if (list.includes(selectedPeriodState)) return selectedPeriodState;
    }
    if (chartMode === 'HISTORY') return availablePeriods[0] || '';
    return availableProjectionPeriods[0]?.key || '';
  }, [selectedPeriodState, availablePeriods, availableProjectionPeriods, chartMode]);

  const availableBanks = useMemo(() => Array.from(new Set(uniqueTransactions.map(t => t.bankName).filter(Boolean))), [uniqueTransactions]);

  // LÓGICA DE DETECCIÓN Y PROYECCIÓN DE FECHAS
  const statementDates = useMemo(() => {
    if (selectedBank === 'all' || !activePeriod) return null;
    
    // 1. Verificar si existen datos REALES para este periodo en el banco seleccionado
    const transactionsInPeriod = bankFilteredTransactions.filter(t => getStatementPeriod(t) === activePeriod);
    const realSample = transactionsInPeriod.find(t => t.statementClosingDate || t.statementDueDate);

    const [activeY, activeM] = activePeriod.split('-').map(Number);
    
    // Si tenemos una transacción real en este periodo, usamos SUS fechas directamente
    if (realSample && realSample.statementClosingDate) {
      const closingDate = parseSafeDate(realSample.statementClosingDate);
      const dueDate = parseSafeDate(realSample.statementDueDate);
      
      return {
        closing: closingDate ? { label: closingDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' }), isEstimated: false } : null,
        due: dueDate ? { label: dueDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' }), isEstimated: false } : null,
        isRealData: true
      };
    }

    // 2. Si NO hay datos reales, PROYECTAMOS basándonos en la última información disponible
    const lastClosingSample = [...bankFilteredTransactions]
      .filter(t => t.statementClosingDate && String(t.statementClosingDate).trim() !== '')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const lastDueSample = [...bankFilteredTransactions]
      .filter(t => t.statementDueDate && String(t.statementDueDate).trim() !== '')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (!lastClosingSample && !lastDueSample) return null;

    const processProjectedDate = (sampleTx: Transaction, isClosing: boolean) => {
        const dateStr = isClosing ? sampleTx.statementClosingDate : sampleTx.statementDueDate;
        const baseDate = parseSafeDate(dateStr);
        if (!baseDate) return null;

        const basePeriod = getStatementPeriod(sampleTx);
        const [baseY, baseM] = basePeriod.split('-').map(Number);
        const baseRefDate = new Date(baseY, baseM - 1, 1);
        const targetRefDate = new Date(activeY, activeM - 1, 1);
        
        // Calculamos la diferencia de meses entre el origen del dato y el periodo actual
        const diffMonths = getMonthDifference(baseRefDate, targetRefDate);
        
        // Aplicamos esa diferencia a la fecha original
        const projected = new Date(baseDate);
        projected.setMonth(baseDate.getMonth() + diffMonths);
        
        return {
            label: projected.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' }),
            isEstimated: true
        };
    };

    const closing = lastClosingSample ? processProjectedDate(lastClosingSample, true) : null;
    const due = lastDueSample ? processProjectedDate(lastDueSample, false) : null;

    return { closing, due, isRealData: false };
  }, [selectedBank, activePeriod, bankFilteredTransactions]);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => setShouldRenderChart(true), 100); 
      return () => clearTimeout(timer);
    } else { setShouldRenderChart(false); }
  }, [isVisible]);

  const historyData = useMemo(() => {
    const monthlyTotals: Record<string, number> = {};
    bankFilteredTransactions.forEach(t => {
       const key = getStatementPeriod(t); 
       monthlyTotals[key] = (monthlyTotals[key] || 0) + t.amount;
    });
    return availablePeriods.map(key => {
        const [y, m] = key.split('-').map(Number);
        const date = new Date(y, m - 1, 1);
        const label = date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).replace('.', '');
        return { periodKey: key, name: label.charAt(0).toUpperCase() + label.slice(1), amount: monthlyTotals[key] || 0 };
    }).reverse();
  }, [bankFilteredTransactions, availablePeriods]);

  const projectionData = useMemo(() => {
    return availableProjectionPeriods.map(p => {
        const [ty, tm] = p.key.split('-').map(Number);
        const futureDate = new Date(ty, tm - 1, 1);
        const amount = bankFilteredTransactions.reduce((acc, t) => {
            const txPeriod = getStatementPeriod(t);
            if (p.isBase) return txPeriod === p.key ? acc + t.amount : acc;
            if (!t.isInstallment) return acc;
            const [oy, om] = txPeriod.split('-').map(Number);
            const txBaseDate = new Date(oy, om - 1, 1);
            const diff = getMonthDifference(txBaseDate, futureDate);
            return (diff > 0 && (t.installmentCurrent || 1) + diff <= (t.installmentTotal || 1)) ? acc + t.amount : acc;
        }, 0);
        return { name: futureDate.toLocaleDateString('es-ES', { month: 'short' }).charAt(0).toUpperCase() + futureDate.toLocaleDateString('es-ES', { month: 'short' }).slice(1), amount, periodKey: p.key };
    });
  }, [bankFilteredTransactions, availableProjectionPeriods]);

  const totalsByBank = useMemo(() => {
    if (!activePeriod) return [];
    const [targetY, targetM] = activePeriod.split('-').map(Number);
    const targetDate = new Date(targetY, targetM - 1, 1);
    const isBaseMonth = activePeriod === (availablePeriods[0] || '');
    const bankMap: Record<string, number> = {};
    availableBanks.forEach(b => bankMap[b] = 0);
    uniqueTransactions.forEach(t => {
        const bank = t.bankName || 'Otro';
        const txPeriod = getStatementPeriod(t);
        if (chartMode === 'HISTORY' || (chartMode === 'PROJECTION' && isBaseMonth)) {
            if (txPeriod === activePeriod) bankMap[bank] = (bankMap[bank] || 0) + t.amount;
        } else {
            if (t.isInstallment) {
                const [oy, om] = txPeriod.split('-').map(Number);
                const txBaseDate = new Date(oy, om - 1, 1);
                const diff = getMonthDifference(txBaseDate, targetDate);
                if (diff > 0 && (t.installmentCurrent || 1) + diff <= (t.installmentTotal || 1)) bankMap[bank] = (bankMap[bank] || 0) + t.amount;
            }
        }
    });
    return Object.entries(bankMap).filter(([_, total]) => total > 0).map(([name, total]) => ({ name, total }));
  }, [uniqueTransactions, activePeriod, chartMode, availablePeriods, availableBanks]);

  const processedTableData: ProcessedResult = useMemo(() => {
    if (!activePeriod) return { rawTransactions: [], groupedTransactions: [], summary: { total: 0, totalUSD: 0, totalInstallments: 0, totalTaxes: 0 }};
    let raw: Transaction[] = [];
    const [targetY, targetM] = activePeriod.split('-').map(Number);
    const targetDate = new Date(targetY, targetM - 1, 1);
    const baseMonthKey = availablePeriods[0] || '';
    const isBaseMonth = activePeriod === baseMonthKey;

    if (chartMode === 'HISTORY' || (chartMode === 'PROJECTION' && isBaseMonth)) {
      raw = bankFilteredTransactions.filter(t => getStatementPeriod(t) === activePeriod);
    } else {
      raw = bankFilteredTransactions.filter(t => {
        if (!t.isInstallment) return false;
        const txPeriod = getStatementPeriod(t);
        const [ty, tm] = txPeriod.split('-').map(Number);
        const txBaseDate = new Date(ty, tm - 1, 1);
        const diff = getMonthDifference(txBaseDate, targetDate);
        return diff > 0 && (t.installmentCurrent || 1) + diff <= (t.installmentTotal || 1);
      }).map(t => {
          const txPeriod = getStatementPeriod(t);
          const [ty, tm] = txPeriod.split('-').map(Number);
          const txBaseDate = new Date(ty, tm - 1, 1);
          const diff = getMonthDifference(txBaseDate, targetDate);
          const projectedInstallment = (t.installmentCurrent || 1) + diff;
          const explanation = `En ${formatMonthYear(targetDate)} pagarás la cuota ${projectedInstallment} de ${t.installmentTotal}.`;
          return { ...t, installmentCurrent: projectedInstallment, explanation };
      });
    }

    // APLICAR FILTRO DE BÚSQUEDA
    if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        raw = raw.filter(t => 
            t.detail.toLowerCase().includes(term) || 
            (t.bankName && t.bankName.toLowerCase().includes(term))
        );
    }

    const grouped: Transaction[] = [];
    const taxItems: Transaction[] = [];
    const taxKeywords = ['IVA', 'IMPUESTO', 'SELLOS', 'PERCEPCION', 'DB.RG', 'MANTENIMIENTO', 'COMISION', 'ARCA', 'IIBB', 'TASA', 'INT.'];
    raw.forEach(tx => {
      const isTax = tx.type === TransactionType.TAX_FEE || taxKeywords.some(k => tx.detail.toUpperCase().includes(k));
      if (isTax) taxItems.push(tx); else grouped.push(tx);
    });
    
    if (taxItems.length > 0) {
        grouped.push({ 
            id: 'grouped-taxes-dash', 
            date: activePeriod + '-01', 
            detail: 'Gastos de Tarjeta / Impuestos', 
            amount: taxItems.reduce((sum, t) => sum + t.amount, 0), 
            type: TransactionType.TAX_FEE, 
            isInstallment: false, 
            children: taxItems 
        });
    }

    return { 
        rawTransactions: raw, 
        groupedTransactions: grouped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), 
        summary: { 
            total: raw.reduce((sum, t) => sum + t.amount, 0), 
            totalUSD: 0, 
            totalInstallments: raw.filter(t => t.isInstallment).reduce((sum, t) => sum + t.amount, 0), 
            totalTaxes: taxItems.reduce((sum, t) => sum + t.amount, 0) 
        } 
    };
  }, [bankFilteredTransactions, activePeriod, chartMode, availablePeriods, searchTerm]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedBank('all');
  };

  const hasActiveFilters = searchTerm !== '' || selectedBank !== 'all';

  if (isLoading) return <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin text-brand-500" size={48} /></div>;

  const formatCurrency = (val: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Analizador Financiero</h2>
          <p className="text-slate-500 text-xs flex items-center gap-1">Visualizando: <span className="font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full uppercase tracking-tight">{activePeriod ? formatMonthYear(new Date(parseInt(activePeriod.split('-')[0]), parseInt(activePeriod.split('-')[1]) - 1, 1)) : '...'}</span></p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          {/* BUSCADOR */}
          <div className="relative group w-full md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
            <input 
                type="text"
                placeholder="Buscar consumo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-9 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm transition-all"
            />
            {searchTerm && (
                <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                    <X size={14} />
                </button>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
             <CalendarDays size={14} className="text-slate-400" />
             <select value={activePeriod} onChange={(e) => setSelectedPeriodState(e.target.value)} className="text-xs font-bold outline-none bg-transparent cursor-pointer text-slate-700 min-w-[160px]">
                {chartMode === 'HISTORY' ? (availablePeriods.map(p => { const [y, m] = p.split('-'); const label = new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('es-ES', {month: 'long', year: 'numeric'}); return <option key={p} value={p}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>; })) : (availableProjectionPeriods.map(p => (<option key={p.key} value={p.key}>{p.label.charAt(0).toUpperCase() + p.label.slice(1)}</option>)))}
             </select>
          </div>
          <div className="flex items-center bg-slate-200/50 p-1 rounded-xl">
             <button onClick={() => { setChartMode('HISTORY'); setSelectedPeriodState(availablePeriods[0] || ''); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${chartMode === 'HISTORY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>HISTORIAL</button>
             <button onClick={() => { setChartMode('PROJECTION'); setSelectedPeriodState(availableProjectionPeriods[0]?.key || ''); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${chartMode === 'PROJECTION' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>FUTURO</button>
          </div>
          
          <div className="flex items-center gap-2">
            <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none shadow-sm text-slate-700">
               <option value="all">Todos los Bancos</option>
               {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            {hasActiveFilters && (
                <button 
                    onClick={handleResetFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-xl text-[10px] font-bold hover:bg-black transition-all animate-fade-in shadow-md"
                    title="Restablecer filtros"
                >
                    <FilterX size={14} />
                    <span className="hidden sm:inline uppercase">Limpiar</span>
                </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        {selectedBank === 'all' ? (
            <div className="animate-fade-in-up space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <PieChart size={12} /> Desglose por Entidad
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div className="p-5 rounded-3xl border-2 border-brand-500 bg-white shadow-lg shadow-brand-100/20 transform hover:-translate-y-1 transition-all"><div className="flex justify-between items-start mb-2"><h4 className="font-black text-[10px] text-brand-600 uppercase tracking-tighter">Total a Pagar</h4><Sparkles size={14} className="text-brand-400" /></div><p className="text-2xl font-black text-slate-900">{formatCurrency(processedTableData.summary.total)}</p></div>
                    {totalsByBank.map((bank, idx) => (<div key={bank.name} className={`p-5 rounded-3xl border shadow-sm transition-all hover:scale-[1.02] cursor-pointer ${PASTEL_COLORS[idx % PASTEL_COLORS.length]}`} onClick={() => setSelectedBank(bank.name)}><div className="flex justify-between items-start mb-2"><h4 className="font-bold text-xs truncate uppercase tracking-tight">{bank.name}</h4><CreditCard size={14} className="opacity-30" /></div><p className="text-xl font-black">{formatCurrency(bank.total)}</p></div>))}
                </div>
            </div>
        ) : (
            <div className="bg-gradient-to-br from-brand-50 to-indigo-50 border border-brand-100 rounded-3xl p-6 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-brand-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total del Banco</p>
                        <p className="text-2xl font-black text-slate-900">{formatCurrency(processedTableData.summary.total)}</p>
                    </div>
                    
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-brand-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">En Cuotas</p>
                        <p className="text-2xl font-black text-brand-700">{formatCurrency(processedTableData.summary.totalInstallments)}</p>
                    </div>

                    <div className="bg-white/70 p-5 rounded-2xl border border-indigo-100 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock size={12} className="text-indigo-400" />
                            <p className="text-[10px] font-bold text-slate-500 uppercase">Cierre</p>
                        </div>
                        <p className={`text-lg font-black ${statementDates?.closing?.isEstimated ? 'text-indigo-400' : 'text-indigo-700'}`}>
                            {statementDates?.closing?.label || 'Sin fecha'}
                        </p>
                        {statementDates?.closing?.isEstimated && <span className="text-[8px] font-bold text-indigo-300 uppercase tracking-tighter">Estimado</span>}
                    </div>

                    <div className="bg-white/70 p-5 rounded-2xl border border-emerald-100 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-1">
                            <CalendarCheck size={12} className="text-emerald-400" />
                            <p className="text-[10px] font-bold text-slate-500 uppercase">Vencimiento</p>
                        </div>
                        <p className={`text-lg font-black ${statementDates?.due?.isEstimated ? 'text-emerald-400' : 'text-emerald-700'}`}>
                            {statementDates?.due?.label || 'Sin fecha'}
                        </p>
                        {statementDates?.due?.isEstimated && <span className="text-[8px] font-bold text-emerald-300 uppercase tracking-tighter">Estimado</span>}
                    </div>

                    <div className="bg-white/60 p-5 rounded-2xl border border-brand-100 flex flex-col items-center justify-center text-center">
                        <p className="text-[9px] font-black text-brand-600 uppercase mb-1 tracking-widest">Estado Ciclo</p>
                        <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase ${statementDates?.isRealData ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>{statementDates?.isRealData ? 'Ciclo Actual' : 'Proyectado'}</span>
                    </div>
                </div>
            </div>
        )}
        
        {/* GRÁFICO (Se oculta si hay una búsqueda activa para priorizar la tabla) */}
        {!searchTerm && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="h-64 w-full">
                    {shouldRenderChart && (
                        <ResponsiveContainer width="100%" height="100%">
                            {chartMode === 'PROJECTION' ? (
                                <AreaChart data={projectionData} onClick={(d: any) => d?.activePayload && setSelectedPeriodState(d.activePayload[0].payload.periodKey)}>
                                    <defs>
                                        <linearGradient id="colorProj" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
                                    <YAxis hide={true} />
                                    <Tooltip cursor={{stroke: '#6366f1', strokeWidth: 1}} formatter={(v: number) => [formatCurrency(v), 'Compromisos']} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                    <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorProj)" />
                                </AreaChart>
                            ) : (
                                <BarChart data={historyData} onClick={(d: any) => d?.activePayload && setSelectedPeriodState(d.activePayload[0].payload.periodKey)}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
                                    <YAxis hide={true} />
                                    <Tooltip cursor={{fill: '#f8fafc'}} formatter={(v: number) => [formatCurrency(v), 'Pagado']} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                    <Bar dataKey="amount" radius={[8, 8, 0, 0]} barSize={40}>
                                        {historyData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.periodKey === activePeriod ? '#059669' : '#10b981'} className="cursor-pointer" />
                                        ))}
                                    </Bar>
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        )}

        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 uppercase tracking-tight text-sm">
              <Layers size={16} className="text-brand-500"/>
              {searchTerm ? `Resultados de "${searchTerm}"` : 'Movimientos del Periodo'}
            </h3>
            <div className="flex items-center gap-3">
                {processedTableData.rawTransactions.some(t => t.isPostClosing) && (
                  <div className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-100 flex items-center gap-1 font-bold">
                    <AlertCircle size={12} /> Se incluyen consumos post-cierre
                  </div>
                )}
                {searchTerm && (
                    <span className="text-[10px] font-bold text-slate-400">
                        {processedTableData.groupedTransactions.length} encontrados
                    </span>
                )}
            </div>
          </div>
          
          {processedTableData.groupedTransactions.length > 0 ? (
            <ResultsTable 
                transactions={processedTableData.groupedTransactions} 
                summary={processedTableData.summary} 
                bankName={selectedBank === 'all' ? 'Consolidado' : selectedBank} 
                readOnly={true} 
                showSummary={false} 
                selectedId={selectedTxId} 
                onRowClick={(id) => setSelectedTxId(selectedTxId === id ? null : id)} 
            />
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                    <Search size={32} className="opacity-20" />
                </div>
                <div className="text-center">
                    <p className="font-bold text-sm text-slate-600">No se encontraron consumos</p>
                    <p className="text-xs">Intenta con otra palabra clave o revisa los filtros.</p>
                </div>
                {searchTerm && (
                    <button 
                        onClick={() => setSearchTerm('')}
                        className="text-brand-600 text-xs font-bold hover:underline"
                    >
                        Limpiar búsqueda
                    </button>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
