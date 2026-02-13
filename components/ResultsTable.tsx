
import React, { useState } from 'react';
import { Transaction, TransactionType } from '../types';
import { ChevronDown, ChevronRight, CreditCard, Download, RefreshCw, Bug, Eye, EyeOff, FileSearch, Info, HelpCircle } from 'lucide-react';

interface ResultsTableProps {
  transactions: Transaction[];
  summary: {
    total: number;
    totalUSD: number;
    totalInstallments: number;
    totalTaxes: number;
  };
  bankName: string;
  onReset?: () => void;
  readOnly?: boolean;
  showSummary?: boolean;
  onRowClick?: (id: string) => void;
  selectedId?: string | null;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ 
  transactions, 
  summary, 
  bankName, 
  onReset, 
  readOnly = false,
  showSummary = true,
  onRowClick,
  selectedId
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showDebug, setShowDebug] = useState(false);

  const toggleGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    const newSet = new Set(expandedGroups);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedGroups(newSet);
  };

  const handleRowClick = (id: string) => {
    if (onRowClick) {
      onRowClick(id);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`; 
  };

  const getAllFlatTransactions = () => {
    let flat: Transaction[] = [];
    transactions.forEach(tx => {
      flat.push(tx);
      if (tx.children) {
        flat = [...flat, ...tx.children];
      }
    });
    return flat;
  };

  const flatList = getAllFlatTransactions();
  const taxCount = flatList.filter(t => t.type === TransactionType.TAX_FEE).length;

  return (
    <div className="max-w-full mx-auto space-y-4 animate-fade-in-up">
      {showSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="bg-white px-4 py-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total a Pagar</p>
            <div className="text-lg font-bold text-slate-900">{formatCurrency(summary.total)}</div>
          </div>
          <div className="bg-white px-4 py-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Cuotas</p>
            <div className="text-base font-semibold text-brand-600">{formatCurrency(summary.totalInstallments)}</div>
          </div>
          <div className="bg-white px-4 py-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
             <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Impuestos</p>
            <div className="text-base font-semibold text-slate-600">{formatCurrency(summary.totalTaxes)}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {!readOnly && (
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 flex items-center gap-2 text-xs">
              <CreditCard size={14} className="text-brand-500"/>
              {bankName}
            </h3>
            <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowDebug(!showDebug)} 
                  className={`text-[10px] px-2 py-1 rounded border flex items-center gap-1 transition-colors ${showDebug ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}
                >
                  <FileSearch size={10} /> {showDebug ? 'Ocultar Auditoría' : 'Auditoría IA'}
                </button>
                <span className="text-[10px] text-slate-400 font-medium">{transactions.length} registros</span>
            </div>
          </div>
        )}
        
        {showDebug ? (
            <div className="overflow-x-auto p-4 bg-slate-900 text-slate-300 font-mono text-xs">
                <table className="w-full text-left">
                    <thead className="text-slate-500 border-b border-slate-700">
                        <tr>
                            <th className="p-2 w-8">#</th>
                            <th className="p-2">Type</th>
                            <th className="p-2">Detail</th>
                            <th className="p-2 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {flatList.map((tx, idx) => (
                            <tr key={tx.id + '-debug'} className={`hover:bg-white/5 ${tx.type === 'TAX_FEE' ? 'bg-amber-900/10 text-amber-200' : ''}`}>
                                <td className="p-2 text-slate-600">{idx + 1}</td>
                                <td className="p-2">{tx.type}</td>
                                <td className="p-2">{tx.detail}</td>
                                <td className="p-2 text-right">{tx.amount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 uppercase tracking-tight">
                <tr>
                    <th className="px-2 py-2 w-6"></th>
                    <th className="px-2 py-2 w-16">Fecha</th>
                    <th className="px-2 py-2">Detalle del Movimiento</th>
                    <th className="px-2 py-2 text-right w-24">Monto</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                {transactions.map((tx) => {
                    const hasChildren = tx.children && tx.children.length > 0;
                    const isExpanded = expandedGroups.has(tx.id);
                    const isSelected = selectedId === tx.id;
                    const isTaxGroup = tx.id === 'grouped-taxes' || tx.id === 'grouped-taxes-dash';
                    
                    return (
                    <React.Fragment key={tx.id}>
                        <tr 
                            className={`transition-all cursor-pointer group border-l-2 ${
                                isSelected 
                                    ? 'bg-indigo-50/80 border-indigo-500' 
                                    : isTaxGroup ? 'bg-amber-50/20 border-transparent hover:bg-amber-50/40' 
                                    : hasChildren ? 'bg-slate-50/20 border-transparent hover:bg-slate-50' : 'border-transparent hover:bg-slate-50'
                            }`}
                            onClick={() => handleRowClick(tx.id)}
                        >
                        <td className="px-2 py-2.5 text-slate-400 text-center" onClick={(e) => hasChildren && toggleGroup(tx.id, e)}>
                            {hasChildren && (
                            <button className="hover:text-brand-600 p-0.5">
                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                            )}
                        </td>
                        <td className="px-2 py-2.5 text-slate-400 whitespace-nowrap font-mono text-[10px]">{formatDate(tx.date)}</td>
                        <td className="px-2 py-2.5">
                            <div className="flex flex-col">
                                <div className={`font-bold truncate max-w-[180px] md:max-w-md ${isSelected ? 'text-indigo-800' : isTaxGroup ? 'text-amber-800' : 'text-slate-800'}`} title={tx.detail}>
                                    {tx.detail}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {tx.isInstallment && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-blue-700 border border-blue-200 uppercase">
                                            Cuota {tx.installmentCurrent}/{tx.installmentTotal}
                                        </span>
                                    )}
                                    {tx.bankName && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 uppercase">
                                            {tx.bankName}
                                        </span>
                                    )}
                                </div>
                                {tx.explanation && (
                                    <div className="mt-2 p-2 bg-indigo-50/50 rounded-lg border border-indigo-100 text-[10px] text-indigo-700 leading-relaxed flex items-start gap-2 animate-fade-in">
                                        <HelpCircle size={14} className="mt-0.5 shrink-0" />
                                        <span>{tx.explanation}</span>
                                    </div>
                                )}
                            </div>
                        </td>
                        <td className="px-2 py-2.5 text-right font-black text-slate-900 text-xs whitespace-nowrap">
                            {formatCurrency(tx.amount)}
                        </td>
                        </tr>
                        
                        {hasChildren && isExpanded && tx.children?.map(child => (
                        <tr key={child.id} className={isTaxGroup ? "bg-amber-50/10" : "bg-slate-50/30"}>
                            <td className="px-2 py-1.5"></td>
                            <td className="px-2 py-1.5 text-slate-400 text-[9px] font-mono">{formatDate(child.date)}</td>
                            <td className="px-2 py-1.5 text-slate-500 text-[10px] pl-6 border-l-2 border-slate-200 ml-2 truncate">
                            {child.detail}
                            </td>
                            <td className="px-2 py-1.5 text-right text-slate-600 text-[10px] font-mono">
                            {formatCurrency(child.amount)}
                            </td>
                        </tr>
                        ))}
                    </React.Fragment>
                    );
                })}
                </tbody>
            </table>
            </div>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-col md:flex-row gap-4 justify-center pt-4">
          {onReset && (
            <button 
              onClick={onReset}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm font-bold text-sm"
            >
              <RefreshCw size={18} />
              Analizar otro resumen
            </button>
          )}
          <button className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors shadow-md shadow-brand-100 font-bold text-sm">
            <Download size={18} />
            Descargar Reporte
          </button>
        </div>
      )}
    </div>
  );
};

export default ResultsTable;
