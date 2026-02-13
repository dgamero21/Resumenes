
import React, { useState, useRef } from 'react';
import { BankProfile } from '../types';
import { Plus, Trash2, Edit2, X, CreditCard, Loader2, CalendarClock, Lock, FileUp, Sparkles, CheckCircle2 } from 'lucide-react';
import { analyzeBankFormat, fileToGenerativePart } from '../services/geminiService';

interface BankManagerProps {
  banks: BankProfile[];
  onSaveBank: (bank: BankProfile) => void;
  onDeleteBank: (id: string) => void;
  onClose: () => void;
}

const BankManager: React.FC<BankManagerProps> = ({ banks, onSaveBank, onDeleteBank, onClose }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<BankProfile>>({});
  const [isDetecting, setIsDetecting] = useState(false);
  const modalFileRef = useRef<HTMLInputElement>(null);

  const startEdit = (bank?: BankProfile) => {
    if (bank) {
      setEditingId(bank.id);
      setFormData({ ...bank });
    } else {
      setEditingId('new');
      setFormData({ 
        name: '', 
        columns: ['Fecha', 'Detalle', 'Monto'], 
        currencySymbol: '$', 
        identifiers: [], 
        dueDateKeywords: '',
        closingDateKeywords: ''
      });
    }
  };

  const handleSmartDetect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDetecting(true);
    try {
      const base64 = await fileToGenerativePart(file);
      const detected = await analyzeBankFormat(base64);
      
      setFormData(prev => ({
        ...prev,
        id: prev.id || crypto.randomUUID(),
        name: detected.name || prev.name || '',
        columns: detected.columns && detected.columns.length > 0 ? detected.columns : (prev.columns || []),
        currencySymbol: detected.currencySymbol || prev.currencySymbol || '$',
        identifiers: detected.identifiers && detected.identifiers.length > 0 ? detected.identifiers : [],
        dueDateKeywords: detected.dueDateKeywords || prev.dueDateKeywords || '',
        closingDateKeywords: detected.closingDateKeywords || prev.closingDateKeywords || ''
      }));
      
    } catch (err) {
      alert("No se pudo detectar el formato automáticamente. Intenta con otro PDF.");
    } finally {
      setIsDetecting(false);
      if (modalFileRef.current) modalFileRef.current.value = '';
    }
  };

  const handleSave = () => {
    if (!formData.name) {
        alert("El nombre del perfil es obligatorio.");
        return;
    }
    
    const bankToSave: BankProfile = {
      id: editingId === 'new' ? (formData.id || crypto.randomUUID()) : editingId!,
      name: formData.name,
      columns: formData.columns || ['Fecha', 'Detalle', 'Monto'],
      currencySymbol: formData.currencySymbol || '$',
      identifiers: formData.identifiers || [],
      dueDateKeywords: formData.dueDateKeywords || '',
      closingDateKeywords: formData.closingDateKeywords || '',
    };
    
    onSaveBank(bankToSave);
    setEditingId(null);
  };

  // Fix: Added isTrained definition for the component scope (used in the editing modal)
  const isTrained = !!(formData.closingDateKeywords || formData.dueDateKeywords);

  return (
    <div className="max-w-5xl mx-auto md:p-6 bg-white rounded-3xl shadow-sm border border-slate-200 animate-fade-in">
      <div className="flex justify-between items-center mb-8 p-6 md:p-0 border-b md:border-none border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Perfiles de Banco</h2>
           <p className="text-slate-500 text-sm mt-1">Configura cómo la IA interpreta tus resúmenes</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X size={24} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-6 pb-6 md:px-0 md:pb-0">
        {banks.map((bank) => {
          const isTrained = bank.closingDateKeywords || bank.dueDateKeywords;
          return (
            <div key={bank.id} className="p-5 rounded-2xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all bg-white group flex flex-col h-full relative overflow-hidden">
                {isTrained && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white p-1 rounded-bl-xl shadow-sm z-10" title="Perfil Entrenado con IA">
                        <Sparkles size={12} />
                    </div>
                )}
                <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
                        <CreditCard size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 truncate max-w-[120px]">{bank.name}</h3>
                        <div className="flex items-center gap-1">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{bank.currencySymbol} • {bank.columns.length} Cols</p>
                            {isTrained && <CheckCircle2 size={10} className="text-emerald-500" />}
                        </div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => startEdit(bank)} className="p-2 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-slate-50 transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => onDeleteBank(bank.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-50 transition-colors"><Trash2 size={16} /></button>
                </div>
                </div>
                <div className="mt-auto space-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <CalendarClock size={12} className="text-brand-400" />
                        <span className="truncate">Vence: {bank.dueDateKeywords || 'No configurado'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <Lock size={12} className="text-indigo-400" />
                        <span className="truncate">Cierre: {bank.closingDateKeywords || 'No configurado'}</span>
                    </div>
                </div>
            </div>
          );
        })}
        <button onClick={() => startEdit()} className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand-400 hover:bg-brand-50/20 text-slate-400 hover:text-brand-600 min-h-[140px] gap-3 transition-all">
            <Plus size={24} />
            <span className="font-semibold text-sm">Nuevo Banco</span>
        </button>
      </div>

      {editingId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-slate-800">{editingId === 'new' ? 'Nuevo Perfil de Banco' : 'Editar Perfil'}</h3>
                <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                 <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1 tracking-[0.1em]">Nombre</label>
                    <input type="text" placeholder="Ej: Galicia" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-slate-800/5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 transition-all text-sm font-semibold text-slate-700" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1 tracking-[0.1em]">Símbolo</label>
                    <input type="text" value={formData.currencySymbol || ''} onChange={(e) => setFormData({...formData, currencySymbol: e.target.value})} className="w-full px-4 py-3 bg-slate-800/5 border border-slate-200 rounded-xl outline-none text-center focus:ring-2 focus:ring-brand-500 transition-all text-sm font-bold text-slate-700" />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-bold text-emerald-600 uppercase mb-1 ml-1 flex items-center gap-1 tracking-[0.1em]">
                        <CalendarClock size={11} /> Vencimiento
                    </label>
                    <input 
                        type="text" 
                        value={formData.dueDateKeywords || ''} 
                        onChange={(e) => setFormData({...formData, dueDateKeywords: e.target.value})} 
                        className="w-full px-4 py-3 border border-emerald-100 bg-emerald-50/20 rounded-xl outline-none text-xs font-medium text-slate-700 placeholder:text-emerald-300" 
                        placeholder="vencimiento actual" 
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1 ml-1 flex items-center gap-1 tracking-[0.1em]">
                        <Lock size={11} /> Cierre Ciclo
                    </label>
                    <input 
                        type="text" 
                        value={formData.closingDateKeywords || ''} 
                        onChange={(e) => setFormData({...formData, closingDateKeywords: e.target.value})} 
                        className="w-full px-4 py-3 border border-indigo-100 bg-indigo-50/20 rounded-xl outline-none text-xs font-medium text-slate-700 placeholder:text-indigo-300" 
                        placeholder="cierre actual" 
                    />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1 tracking-[0.1em]">Columnas (separadas por coma)</label>
                <input 
                    type="text" 
                    value={formData.columns?.join(', ') || ''} 
                    onChange={(e) => setFormData({...formData, columns: e.target.value.split(',').map(s => s.trim())})} 
                    className="w-full px-4 py-3 bg-slate-800/5 border border-slate-200 rounded-xl outline-none text-xs font-medium text-slate-700" 
                    placeholder="Fecha, Detalle, Monto" 
                />
              </div>

              <div className="p-6 rounded-3xl bg-slate-50/80 border border-slate-100 flex flex-col items-start gap-3">
                <input type="file" ref={modalFileRef} accept=".pdf" onChange={handleSmartDetect} className="hidden" />
                
                <div className="flex items-center justify-between w-full">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Validación Inteligente</p>
                    {isTrained && <span className="text-[8px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">Entrenado</span>}
                </div>
                
                {isDetecting ? (
                    <div className="flex items-center gap-3 py-2">
                        <Loader2 className="animate-spin text-brand-500" size={18} />
                        <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest animate-pulse">Analizando PDF Modelo...</p>
                    </div>
                ) : (
                    <div 
                        onClick={() => modalFileRef.current?.click()}
                        className="w-full cursor-pointer hover:bg-slate-100/50 p-2 rounded-xl transition-all"
                    >
                        <p className="text-[11px] text-slate-400 italic leading-relaxed">
                            {isTrained ? '¿Quieres volver a entrenar? Sincroniza un nuevo PDF.' : 'Sincroniza un PDF para que la IA aprenda el formato de este banco.'}
                        </p>
                    </div>
                )}
              </div>
            </div>

            <div className="flex justify-end items-center gap-6 mt-10">
              <button onClick={() => setEditingId(null)} className="text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors">Cancelar</button>
              <button onClick={handleSave} className="px-10 py-3.5 bg-brand-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-brand-100 active:scale-95 transition-all">
                Guardar Perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankManager;
