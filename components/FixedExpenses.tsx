
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FixedExpense, Transaction, TransactionType } from '../types';
import { Plus, Trash2, ArrowDownCircle, Loader2, CalendarDays, CreditCard, AlertCircle, CheckCircle2, LayoutGrid, Info, DollarSign, ArrowUpCircle } from 'lucide-react';
import { getCleanTransactions, getMonthDifference, getStatementPeriod } from './Dashboard';

interface FixedExpensesProps {
  transactions: Transaction[];
  income: number;
  fixedExpenses: FixedExpense[];
  onUpdateIncome: (val: number) => Promise<void>;
  onUpdateFixedExpenses: (list: FixedExpense[]) => Promise<void>;
  isLoading: boolean;
}

const FixedExpenses: React.FC<FixedExpensesProps> = ({ 
  transactions, income, fixedExpenses, onUpdateIncome, onUpdateFixedExpenses, isLoading 
}) => {
  const [localExpenses, setLocalExpenses] = useState<FixedExpense[]>(fixedExpenses);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalExpenses(fixedExpenses);
  }, [fixedExpenses]);

  const uniqueTransactions = useMemo(() => getCleanTransactions(transactions), [transactions]);

  const triggerAutoSave = (newList: FixedExpense[]) => {
    setIsSaving(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      await onUpdateFixedExpenses(newList);
      setIsSaving(false);
    }, 1000);
  };

  const formatCurrency = (v: number) => {
    return new Intl.NumberFormat('es-AR', { 
      style: 'currency', 
      currency: 'ARS', 
      maximumFractionDigits: 0 
    }).format(v).replace('ARS', '$');
  };

  const { availablePeriods, latestMonthKey } = useMemo(() => {
    const periods = new Set<string>(uniqueTransactions.map(t => getStatementPeriod(t)).filter(p => p !== 'Unknown'));
    const sorted = Array.from(periods).sort().reverse();
    const latest: string = sorted[0] || '';
    
    const future = [];
    const base = latest ? new Date(parseInt(latest.split('-')[0]), parseInt(latest.split('-')[1]) - 1, 1) : new Date();
    for (let i = 0; i <= 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      future.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      });
    }
    return { availablePeriods: future, latestMonthKey: latest };
  }, [uniqueTransactions]);

  const activePeriod = selectedPeriod || availablePeriods[0]?.key;

  const cardTotalForMonth = useMemo(() => {
    if (!activePeriod) return 0;
    const [targetY, targetM] = activePeriod.split('-').map(Number);
    const targetDate = new Date(targetY, targetM - 1, 1);
    const isBaseMonth = activePeriod === latestMonthKey;

    return uniqueTransactions.reduce((sum, t) => {
      const txPeriodKey = getStatementPeriod(t);
      if (isBaseMonth) {
          return txPeriodKey === activePeriod ? sum + t.amount : sum;
      } 
      
      if (!t.isInstallment) return sum;

      const [oy, om] = txPeriodKey.split('-').map(Number);
      const txBaseDate = new Date(oy, om - 1, 1);
      const diff = getMonthDifference(txBaseDate, targetDate);

      // CORRECCIÓN: Usar la misma lógica de proyección que el Dashboard
      if (diff > 0 && (t.installmentCurrent || 1) + diff <= (t.installmentTotal || 1)) {
          return sum + t.amount;
      }
      return sum;
    }, 0);
  }, [uniqueTransactions, activePeriod, latestMonthKey]);

  const totalFixed = useMemo(() => localExpenses.reduce((sum, e) => sum + e.amount, 0), [localExpenses]);
  const totalOut = cardTotalForMonth + totalFixed;
  const balance = income - totalOut;
  const isHealthy = balance >= 0;

  const handleEditAmount = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    const newList = localExpenses.map(e => e.id === id ? { ...e, amount: num } : e);
    setLocalExpenses(newList);
    triggerAutoSave(newList);
  };

  const handleAdd = async () => {
    if (!newName || !newAmount) return;
    const expense = { id: Math.random().toString(36).substr(2, 9), name: newName, amount: parseFloat(newAmount) };
    const newList = [...localExpenses, expense];
    setLocalExpenses(newList);
    setIsSaving(true);
    await onUpdateFixedExpenses(newList);
    setIsSaving(false);
    setNewName(''); setNewAmount('');
  };

  const handleDelete = async (id: string) => {
    const newList = localExpenses.filter(e => e.id !== id);
    setLocalExpenses(newList);
    setIsSaving(true);
    await onUpdateFixedExpenses(newList);
    setIsSaving(false);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-brand-500" size={32} /></div>;

  return (
    <div className="max-w-md mx-auto space-y-6 pb-24 animate-fade-in px-4">
      {/* Selector de Período Minimalista */}
      <div className="flex items-center justify-end pt-4">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
            <CalendarDays size={14} className="text-slate-400" />
            <select value={activePeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="text-[10px] font-black outline-none bg-transparent text-slate-700 cursor-pointer uppercase">
                {availablePeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
        </div>
      </div>

      {/* CARD PRINCIPAL */}
      <div className={`p-8 rounded-[2.5rem] border-2 shadow-xl transition-all duration-500 bg-white ${isHealthy ? 'border-brand-100 shadow-brand-100/10' : 'border-rose-100 shadow-rose-100/10'}`}>
        <div className="flex justify-between items-start mb-8">
            <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Tu Saldo Disponible</p>
                <h3 className={`text-5xl font-black tracking-tighter ${isHealthy ? 'text-brand-600' : 'text-rose-600'}`}>
                  {formatCurrency(balance)}
                </h3>
            </div>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isHealthy ? 'bg-brand-50 text-brand-500 shadow-inner' : 'bg-rose-50 text-rose-500 shadow-inner'}`}>
              {isHealthy ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
            </div>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between px-2 text-slate-400 border-b border-slate-50 pb-2 mb-1">
                 <span className="text-[9px] font-bold uppercase tracking-widest">Ingresos Totales</span>
                 <span className="text-sm font-bold">{formatCurrency(income)}</span>
            </div>
            
            <div className="flex gap-3">
                <div className="flex-1 bg-indigo-50/50 p-4 rounded-3xl border border-indigo-100/50">
                    <div className="flex items-center gap-2 mb-1">
                        <CreditCard size={12} className="text-indigo-400" />
                        <p className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Tarjetas</p>
                    </div>
                    <p className="text-lg font-black text-indigo-700 leading-none">{formatCurrency(cardTotalForMonth)}</p>
                </div>
                <div className="flex-1 bg-rose-50/50 p-4 rounded-3xl border border-rose-100/50">
                    <div className="flex items-center gap-2 mb-1">
                        <LayoutGrid size={12} className="text-rose-400" />
                        <p className="text-[9px] font-black uppercase text-rose-400 tracking-wider">Gastos Fijos</p>
                    </div>
                    <p className="text-lg font-black text-rose-700 leading-none">{formatCurrency(totalFixed)}</p>
                </div>
            </div>
        </div>
      </div>

      {/* GRILLA DE GASTOS FIJOS */}
      <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm space-y-6">
        <section>
            <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="font-black text-slate-800 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                  <LayoutGrid size={14} className="text-brand-500" /> 
                  Grilla de Gastos Fijos
                </h3>
                {isSaving && <Loader2 className="animate-spin text-slate-300" size={14} />}
            </div>
            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-inner bg-slate-50/30">
                <table className="w-full text-left">
                    <thead className="bg-white/50 border-b border-slate-100">
                        <tr>
                            <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-tighter">Concepto</th>
                            <th className="px-4 py-2 text-right text-[9px] font-black text-slate-400 uppercase tracking-tighter">Monto ($)</th>
                            <th className="px-4 py-2 w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {localExpenses.length > 0 ? localExpenses.map(exp => (
                            <tr key={exp.id} className="group transition-colors hover:bg-white">
                                <td className="px-4 py-3 text-xs font-bold text-slate-700">{exp.name}</td>
                                <td className="px-2 py-1">
                                    <input 
                                      type="number" 
                                      value={exp.amount === 0 ? '' : exp.amount} 
                                      onChange={(e) => handleEditAmount(exp.id, e.target.value)} 
                                      className="w-full text-right bg-transparent px-3 py-2 rounded-lg border border-transparent group-hover:bg-slate-50 group-hover:border-slate-200 focus:border-brand-400 outline-none font-black text-slate-800 text-xs transition-all" 
                                    />
                                </td>
                                <td className="px-2 text-center">
                                    <button onClick={() => handleDelete(exp.id)} className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-[10px] uppercase font-bold italic tracking-widest">No hay gastos fijos</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 flex gap-2">
                <input 
                  type="text" 
                  placeholder="Nuevo servicio..." 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  className="flex-1 px-4 py-3 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-brand-500 transition-all" 
                />
                <input 
                  type="number" 
                  placeholder="$" 
                  value={newAmount === '0' ? '' : newAmount} 
                  onChange={e => setNewAmount(e.target.value)} 
                  className="w-24 px-4 py-3 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 text-xs outline-none font-bold focus:ring-2 focus:ring-brand-500 transition-all" 
                />
                <button onClick={handleAdd} className="bg-slate-900 text-white p-3 rounded-xl hover:bg-black shadow-lg active:scale-95 transition-all"><Plus size={20} /></button>
            </div>
        </section>

        <section className="pt-6 border-t border-slate-50">
            <div className="flex items-center gap-2 mb-3 px-1">
                <ArrowDownCircle size={14} className="text-slate-300" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-300">Ingreso Mensual</h3>
            </div>
            <div className="bg-slate-50/50 border border-slate-100 rounded-2xl px-5 py-3 flex items-center gap-3 focus-within:ring-2 focus-within:ring-brand-500 transition-all opacity-70 hover:opacity-100">
                <DollarSign size={18} className="text-slate-300" />
                <input 
                  type="number" 
                  value={income === 0 ? '' : income} 
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    onUpdateIncome(val);
                  }} 
                  className="bg-transparent text-lg font-bold outline-none w-full text-slate-600 placeholder:text-slate-200" 
                  placeholder="Monto de ingresos..." 
                />
            </div>
        </section>
      </div>
      
      <div className="px-6 py-2 flex items-center gap-2 text-slate-400 text-[10px] justify-center text-center leading-tight">
        <Info size={12} className="shrink-0" />
        <p>El balance resta tarjetas y gastos fijos a tu ingreso mensual.</p>
      </div>
    </div>
  );
};

export default FixedExpenses;
