import React, { useState, useEffect } from 'react';
import { Mail, Search, Calendar, DollarSign, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck, RefreshCw, LogIn } from 'lucide-react';
import { parseServiceBill, searchUserEmails } from '../services/geminiService';
import { loginToGmail, isGmailConnected, initGmailClient } from '../services/gmailService';
import { BillExtractionResult } from '../types';

interface ServiceBillParserProps {
  onBack: () => void;
}

const ServiceBillParser: React.FC<ServiceBillParserProps> = ({ onBack }) => {
  const [serviceName, setServiceName] = useState('');
  const [keywords, setKeywords] = useState('Factura Vencimiento');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [result, setResult] = useState<BillExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize Google Script
    initGmailClient();
    setIsConnected(isGmailConnected());
  }, []);

  const handleConnect = async () => {
    try {
        await loginToGmail();
        setIsConnected(true);
        setError(null);
    } catch (e: any) {
        console.error(e);
        setError(e.error === 'popup_closed_by_user' ? 'Inicio de sesión cancelado.' : 'No se pudo conectar con Google. Verifica tu Client ID.');
    }
  };

  const handleScan = async () => {
    if (!serviceName || !keywords) {
      setError("Por favor completa el nombre del servicio y palabras clave.");
      return;
    }

    if (!isConnected) {
        await handleConnect();
        if (!isGmailConnected()) return; // User cancelled or failed
    }

    setIsProcessing(true);
    setScanStatus('Buscando en tu Gmail...');
    setError(null);
    setResult(null);

    try {
      // 1. Search Real Emails
      const emailContent = await searchUserEmails(serviceName, keywords);
      
      setScanStatus('Analizando factura con Gemini AI...');
      
      // 2. Parse Content
      const data = await parseServiceBill(emailContent, "user@gmail.com", serviceName, keywords);
      setResult(data);
    } catch (err: any) {
      if (err.message === 'AUTH_REQUIRED') {
          setIsConnected(false);
          setError("La sesión expiró. Por favor conecta nuevamente.");
      } else {
          setError(err.message || "Error al procesar el correo.");
      }
    } finally {
      setIsProcessing(false);
      setScanStatus('');
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS' }).format(amount);
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in-up pb-10">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Mail className="text-brand-600" /> Escáner de Facturas (Gmail)
        </h2>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800 underline">
            Volver al Inicio
        </button>
      </div>

      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
        
        {/* Auth Section */}
        {!isConnected && !result && (
            <div className="mb-8 p-6 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Mail size={24} className="text-red-500" />
                </div>
                <h3 className="font-bold text-slate-800 mb-2">Conectar con Gmail</h3>
                <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
                    Para buscar tus facturas automáticamente, necesitamos permiso de lectura. 
                    La IA analizará el correo localmente para extraer los montos.
                </p>
                <button 
                    onClick={handleConnect}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-all shadow-sm mx-auto"
                >
                    <LogIn size={18} />
                    Iniciar Sesión con Google
                </button>
            </div>
        )}

        {!result ? (
            <div className={`space-y-6 transition-opacity ${!isConnected ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre del Servicio</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                value={serviceName}
                                onChange={(e) => setServiceName(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                placeholder="Ej: Netflix, Personal, Edesur"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Palabras Clave (Ayuda a la IA)</label>
                        <input 
                            type="text" 
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                            placeholder="Ej: Factura, Resumen, Aviso de Vencimiento"
                        />
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 animate-shake">
                        <AlertCircle size={20} />
                        <span className="text-sm font-medium">{error}</span>
                    </div>
                )}

                <button 
                    onClick={handleScan}
                    disabled={isProcessing || !serviceName}
                    className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-200
                        ${isProcessing || !serviceName ? 'bg-slate-300 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 hover:shadow-brand-300 transform active:scale-[0.99]'}`}
                >
                    {isProcessing ? (
                        <>
                            <Loader2 className="animate-spin" size={20} />
                            {scanStatus}
                        </>
                    ) : (
                        <>
                            <Search size={20} />
                            Buscar en Gmail y Analizar
                        </>
                    )}
                </button>
                
                <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1">
                   <ShieldCheck size={12} /> Tus correos se procesan de forma privada y segura con Gemini.
                </p>
            </div>
        ) : (
            <div className="animate-fade-in">
                <div className="flex items-center gap-2 mb-6 text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                    <CheckCircle2 size={20} />
                    <span className="font-semibold">Información Extraída con Éxito</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <FileText size={120} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-6 relative z-10">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Servicio</p>
                            <p className="text-xl font-bold text-slate-800">{result.serviceName}</p>
                        </div>
                        <div className="text-right">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Palabras Encotradas</p>
                             <div className="flex justify-end gap-1 flex-wrap">
                                {result.foundKeywords?.map(k => (
                                    <span key={k} className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded">{k}</span>
                                ))}
                             </div>
                        </div>

                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Calendar size={12}/> Vencimiento
                            </p>
                            <p className="text-lg font-mono text-slate-700">{result.date}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-end gap-1">
                                <DollarSign size={12}/> Total a Pagar
                            </p>
                            <p className="text-2xl font-bold text-brand-600">
                                {formatCurrency(result.amount, result.currency)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex gap-3">
                    <button 
                        onClick={() => setResult(null)}
                        className="flex-1 py-3 border border-slate-300 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={18} />
                        Escanear Otro
                    </button>
                    <button className="flex-1 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors shadow-lg flex items-center justify-center gap-2">
                        Agregar a Gastos <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ServiceBillParser;