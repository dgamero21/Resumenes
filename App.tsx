
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Loader2, Landmark, LayoutGrid, Wallet, Plus, AlertCircle, RefreshCw, Settings as SettingsIcon, CreditCard, ChevronRight, Image as ImageIcon } from 'lucide-react';
import BankManager from './components/BankManager';
import Dashboard from './components/Dashboard';
import FixedExpenses from './components/FixedExpenses';
import Settings from './components/Settings';
import { parseBankStatement, parseTransactionsFromImages, fileToGenerativePart, analyzeBankFormat } from './services/geminiService';
import { saveToGoogleSheets, saveBanksToGoogleSheets, fetchTransactionsFromSheets, fetchBanksFromSheets, fetchFixedExpensesFromSheets, fetchIncomeFromSheets, saveFixedExpensesToSheets, saveIncomeToSheets } from './services/sheetService';
import { BankProfile, Transaction, AppView, FixedExpense } from './types';

export default function App() {
  const [banks, setBanks] = useState<BankProfile[]>([]);
  const [currentView, setCurrentView] = useState<AppView>('HOME');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<Transaction[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [selectedBankForUpload, setSelectedBankForUpload] = useState<BankProfile | null>(null);
  
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [income, setIncome] = useState<number>(0);

  const bankInputRef = useRef<HTMLInputElement>(null);

  const refreshAllData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [txs, bks, fxs, inc] = await Promise.all([
        fetchTransactionsFromSheets(),
        fetchBanksFromSheets(),
        fetchFixedExpensesFromSheets(),
        fetchIncomeFromSheets()
      ]);
      setDashboardData(txs);
      if (bks.length > 0) setBanks(bks);
      setFixedExpenses(fxs);
      setIncome(inc);
    } catch (e) {
      console.error("Error refreshing data:", e);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const handleUpdateIncome = async (val: number) => {
    setIncome(val);
    await saveIncomeToSheets(val);
  };

  const handleUpdateFixedExpenses = async (newList: FixedExpense[]) => {
    setFixedExpenses(newList);
    await saveFixedExpensesToSheets(newList);
  };

  const handleSaveBank = async (bank: BankProfile) => {
    const exists = banks.find(b => b.id === bank.id);
    let newBanks;
    if (exists) {
        newBanks = banks.map(b => b.id === bank.id ? bank : b);
    } else {
        newBanks = [...banks, bank];
    }
    setBanks(newBanks);
    await saveBanksToGoogleSheets(newBanks);
  };

  const handleDeleteBank = async (id: string) => {
    const newBanks = banks.filter(b => b.id !== id);
    setBanks(newBanks);
    await saveBanksToGoogleSheets(newBanks);
  };

  const handleBankUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedBankForUpload) return;
    
    setIsProcessing(true);
    setProcessingStatus(`Analizando archivos para ${selectedBankForUpload.name}...`);
    setError(null);
    
    try {
      const isPdf = files[0].type === 'application/pdf';
      const isImage = files[0].type.startsWith('image/');
      
      let newTransactions: Transaction[] = [];

      if (isPdf) {
        setProcessingStatus('Leyendo Resumen PDF...');
        const base64 = await fileToGenerativePart(files[0]);
        newTransactions = await parseBankStatement(base64, selectedBankForUpload);
      } else if (isImage) {
        setProcessingStatus(`Procesando ${files.length} capturas...`);
        const base64List = await Promise.all(files.map(f => fileToGenerativePart(f)));
        newTransactions = await parseTransactionsFromImages(base64List, selectedBankForUpload);
      } else {
        throw new Error("Formato de archivo no soportado. Sube un PDF o imágenes.");
      }

      if (newTransactions.length > 0) {
        setProcessingStatus('Guardando en la nube...');
        await saveToGoogleSheets(newTransactions, selectedBankForUpload.name);
        await refreshAllData();
        setCurrentView('DASHBOARD');
      } else {
        throw new Error("No se detectaron transacciones en los archivos subidos.");
      }
    } catch (err: any) { 
        setError(err.message); 
    } finally {
      setIsProcessing(false);
      setSelectedBankForUpload(null);
      if (bankInputRef.current) bankInputRef.current.value = '';
    }
  };

  const triggerUpload = (bank: BankProfile) => {
      if (isProcessing) return;
      setSelectedBankForUpload(bank);
      setTimeout(() => bankInputRef.current?.click(), 100);
  };

  const bankColors = [
    { bg: 'bg-indigo-50/50', border: 'border-indigo-100', iconBg: 'bg-indigo-500', text: 'text-indigo-900', hover: 'hover:border-indigo-300 hover:bg-indigo-50' },
    { bg: 'bg-rose-50/50', border: 'border-rose-100', iconBg: 'bg-rose-500', text: 'text-rose-900', hover: 'hover:border-rose-300 hover:bg-rose-50' },
    { bg: 'bg-emerald-50/50', border: 'border-emerald-100', iconBg: 'bg-emerald-500', text: 'text-emerald-900', hover: 'hover:border-emerald-300 hover:bg-emerald-50' },
    { bg: 'bg-amber-50/50', border: 'border-amber-100', iconBg: 'bg-amber-500', text: 'text-amber-900', hover: 'hover:border-amber-300 hover:bg-amber-50' },
    { bg: 'bg-violet-50/50', border: 'border-violet-100', iconBg: 'bg-violet-500', text: 'text-violet-900', hover: 'hover:border-violet-300 hover:bg-violet-50' },
    { bg: 'bg-cyan-50/50', border: 'border-cyan-100', iconBg: 'bg-cyan-500', text: 'text-cyan-900', hover: 'hover:border-cyan-300 hover:bg-cyan-50' },
  ];

  return (
    <div className="h-full w-full bg-slate-50 font-sans text-slate-900 flex flex-col overflow-hidden">
      <input 
        type="file" 
        ref={bankInputRef} 
        accept=".pdf,image/*" 
        multiple 
        onChange={handleBankUpload} 
        className="hidden" 
      />

      <header className="px-6 h-16 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
            <div className="bg-brand-500 p-1.5 rounded-lg"><FileText size={18} className="text-white" /></div>
            <h1 className="font-black text-lg tracking-tight text-slate-800">ResumenIA</h1>
        </div>
        <div className="flex items-center gap-3">
            <button onClick={() => setCurrentView('SETTINGS')} className={`p-2 transition-all ${currentView === 'SETTINGS' ? 'text-brand-600' : 'text-slate-400'}`}>
                <SettingsIcon size={18} />
            </button>
            <button onClick={refreshAllData} className="p-2 text-slate-400">
                <RefreshCw size={18} className={isLoadingData ? "animate-spin" : ""} />
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 custom-scrollbar relative">
        {currentView === 'HOME' && (
            <div className="max-w-md mx-auto space-y-4 pt-4 animate-fade-in">
                
                <div className="bg-white rounded-[2.5rem] border-2 border-dashed border-brand-100 p-8 shadow-sm overflow-hidden">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-14 h-14 bg-brand-50 rounded-full flex items-center justify-center mb-4 relative">
                            <RefreshCw size={26} className={`text-brand-400 ${isProcessing ? 'animate-spin' : ''}`} />
                            <div className="absolute -bottom-1 -right-1 bg-white p-1 rounded-full shadow-sm">
                                <ImageIcon size={14} className="text-brand-500" />
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 text-center">Importar Consumos</h3>
                        <p className="text-slate-400 text-[9px] uppercase font-black tracking-[0.2em] mt-2 text-center">
                            SUBE TU RESUMEN O CAPTURAS DE LA APP
                        </p>
                    </div>
                    
                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-3 py-10">
                            <Loader2 className="animate-spin text-brand-500" size={40} />
                            <p className="font-black text-brand-700 text-[10px] animate-pulse uppercase tracking-widest text-center px-6">
                                {processingStatus}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {banks.length > 0 ? banks.map((bank, idx) => {
                                const color = bankColors[idx % bankColors.length];
                                return (
                                    <button 
                                        key={bank.id} 
                                        onClick={() => triggerUpload(bank)}
                                        className={`flex flex-col items-center gap-3 p-5 rounded-[1.5rem] border ${color.bg} ${color.border} ${color.hover} transition-all group relative overflow-hidden text-center`}
                                    >
                                        <div className={`p-2.5 ${color.iconBg} rounded-xl shadow-sm group-hover:scale-110 transition-transform`}>
                                            <Landmark size={18} className="text-white" />
                                        </div>
                                        <span className={`font-black ${color.text} text-[11px] uppercase tracking-tighter leading-none`}>
                                            {bank.name}
                                        </span>
                                    </button>
                                );
                            }) : (
                                <button 
                                    onClick={() => setCurrentView('BANKS')}
                                    className="col-span-2 p-10 border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 text-xs font-bold hover:border-brand-200 hover:text-brand-600 flex flex-col items-center gap-3"
                                >
                                    <Plus size={32} />
                                    Configura un Banco
                                </button>
                            )}
                        </div>
                    )}
                    
                    {!isProcessing && banks.length > 0 && (
                        <p className="mt-8 text-center text-[10px] text-slate-400 font-medium">
                            Tip: Selecciona varias capturas para sumarlas todas juntas.
                        </p>
                    )}
                </div>

                {error && <div className="p-4 bg-red-50 text-red-700 text-xs rounded-2xl flex items-center gap-3 border border-red-100 shadow-sm"><AlertCircle size={16}/> {error}</div>}
            </div>
        )}

        {currentView === 'DASHBOARD' && <Dashboard transactions={dashboardData} isLoading={isLoadingData} isVisible={true} />}
        {currentView === 'BALANCE' && (
          <FixedExpenses 
            transactions={dashboardData} 
            income={income} 
            fixedExpenses={fixedExpenses}
            onUpdateIncome={handleUpdateIncome}
            onUpdateFixedExpenses={handleUpdateFixedExpenses}
            isLoading={isLoadingData}
          />
        )}
        {currentView === 'BANKS' && (
            <BankManager 
                banks={banks} 
                onSaveBank={handleSaveBank} 
                onDeleteBank={handleDeleteBank} 
                onClose={() => setCurrentView('HOME')} 
            />
        )}
        {currentView === 'SETTINGS' && <Settings onClose={() => setCurrentView('HOME')} />}
      </main>

      {/* BOTTOM NAV - NATIVE APP STYLE */}
      <nav className="h-[72px] bg-white border-t border-slate-100 flex items-center justify-around px-4 shrink-0 z-[60] pb-safe">
        <button 
            onClick={() => setCurrentView('BALANCE')} 
            className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all active:scale-95 ${currentView === 'BALANCE' ? 'text-brand-600' : 'text-slate-400'}`}
        >
            <Wallet size={24} strokeWidth={currentView === 'BALANCE' ? 2.5 : 2} />
            <span className={`text-[11px] ${currentView === 'BALANCE' ? 'font-bold' : 'font-medium'}`}>Balance</span>
        </button>
        <button 
            onClick={() => setCurrentView('DASHBOARD')} 
            className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all active:scale-95 ${currentView === 'DASHBOARD' ? 'text-brand-600' : 'text-slate-400'}`}
        >
            <LayoutGrid size={24} strokeWidth={currentView === 'DASHBOARD' ? 2.5 : 2} />
            <span className={`text-[11px] ${currentView === 'DASHBOARD' ? 'font-bold' : 'font-medium'}`}>Tarjetas</span>
        </button>
        <button 
            onClick={() => setCurrentView('HOME')} 
            className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all active:scale-95 ${currentView === 'HOME' ? 'text-brand-600' : 'text-slate-400'}`}
        >
            <Plus size={24} strokeWidth={currentView === 'HOME' ? 3 : 2} />
            <span className={`text-[11px] ${currentView === 'HOME' ? 'font-bold' : 'font-medium'}`}>Importar</span>
        </button>
        <button 
            onClick={() => setCurrentView('BANKS')} 
            className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all active:scale-95 ${currentView === 'BANKS' ? 'text-brand-600' : 'text-slate-400'}`}
        >
            <Landmark size={24} strokeWidth={currentView === 'BANKS' ? 2.5 : 2} />
            <span className={`text-[11px] ${currentView === 'BANKS' ? 'font-bold' : 'font-medium'}`}>Bancos</span>
        </button>
      </nav>
    </div>
  );
}