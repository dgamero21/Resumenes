
import { GoogleGenAI, Type } from "@google/genai";
import { BankProfile, Transaction, TransactionType, BillExtractionResult } from "../types";
import { fetchGmailMessages, fetchGmailMessageDetail } from "./gmailService";

const getAIClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const cleanJsonString = (text: string): string => {
  return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
};

/**
 * Normaliza fechas de texto a ISO YYYY-MM-DD
 */
const normalizeDate = (dateStr: string): string => {
  if (!dateStr || typeof dateStr !== 'string') return '';
  
  const trimmed = dateStr.trim();
  const months: Record<string, string> = {
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
  };

  const clean = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const parts = clean.split('-').filter(p => p.length > 0);
  
  if (parts.length === 3) {
    let day = parts[0].padStart(2, '0');
    let monthPart = parts[1];
    let month = months[monthPart] || monthPart.padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    const iso = `${year}-${month}-${day}`;
    if (!isNaN(new Date(iso).getTime())) return iso;
  }

  let d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return trimmed;
};

const distributeToPeriod = (txDateStr: string, closingDateStr?: string, dueDateStr?: string): string => {
  if (!txDateStr) return new Date().toISOString().substring(0, 7);
  const txDate = new Date(txDateStr);
  if (isNaN(txDate.getTime())) return txDateStr.substring(0, 7);
  if (!closingDateStr) return txDateStr.substring(0, 7);

  const closingDate = new Date(closingDateStr);
  const dueDate = dueDateStr ? new Date(dueDateStr) : new Date(closingDate.getFullYear(), closingDate.getMonth() + 1, 1);
  
  if (txDate > closingDate) {
    const nextPeriod = new Date(dueDate);
    nextPeriod.setMonth(nextPeriod.getMonth() + 1);
    return nextPeriod.toISOString().substring(0, 7);
  }
  return dueDate.toISOString().substring(0, 7);
};

/**
 * Regla de negocio para Naranja X: Consolidar Plan Zeta
 * SOLO agrupa si la columna CUOTA/PLAN contiene la palabra "ZETA".
 */
const aggregateNaranjaZeta = (transactions: Transaction[], bankName: string): Transaction[] => {
  if (!bankName.toUpperCase().includes('NARANJA')) return transactions;

  const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

  // 1. Filtrar consumos que TIENEN "ZETA" en la columna CUOTA/PLAN (rawPlan)
  const zetaItemsToGroup = transactions.filter(t => {
    const planColumn = (t as any).rawPlan?.toUpperCase() || "";
    return planColumn.includes('ZETA');
  });

  if (zetaItemsToGroup.length === 0) return transactions;

  // 2. Mantener como ordinarios los que NO tienen "ZETA" en la columna CUOTA/PLAN
  // Aunque tengan "ZETA" en el detalle (esto significa que ya son cuotas fijas 02/03, etc.)
  const ordinaryItems = transactions.filter(t => {
    const planColumn = (t as any).rawPlan?.toUpperCase() || "";
    return !planColumn.includes('ZETA');
  });

  // 3. Agrupar los nuevos consumos Zeta por mes para crear el plan consolidado
  const groupsByMonth: Record<number, Transaction[]> = {};
  zetaItemsToGroup.forEach(item => {
    const month = new Date(item.date).getMonth();
    if (!groupsByMonth[month]) groupsByMonth[month] = [];
    groupsByMonth[month].push(item);
  });

  const aggregatedZetaPlans: Transaction[] = Object.entries(groupsByMonth).map(([monthIdx, items]) => {
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const monthName = monthNames[parseInt(monthIdx)];
    
    return {
      ...items[0],
      id: `zeta-agg-${monthName}-${Date.now()}`,
      detail: `ZETA ${monthName}`,
      amount: totalAmount / 3, // Regla: Suma / 3
      type: TransactionType.INSTALLMENT,
      isInstallment: true,
      installmentCurrent: 1,
      installmentTotal: 3,
      children: items // Auditoría: ver qué consumos se sumaron
    };
  });

  return [...ordinaryItems, ...aggregatedZetaPlans];
};

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    dueDate: { type: Type.STRING },
    closingDate: { type: Type.STRING },
    transactions: { 
      type: Type.ARRAY, 
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          detail: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          type: { type: Type.STRING, description: "PURCHASE, INSTALLMENT, TAX_FEE, or PAYMENT" },
          plan: { type: Type.STRING, description: "Raw text from the CUOTA/PLAN column" },
          installmentCurrent: { type: Type.INTEGER },
          installmentTotal: { type: Type.INTEGER }
        },
        required: ["date", "detail", "amount"]
      } 
    }
  }
};

export const parseBankStatement = async (
  fileBase64: string, 
  bankProfile: BankProfile
): Promise<Transaction[]> => {
  const ai = getAIClient();
  const prompt = `Analiza este resumen de ${bankProfile.name}. 
  NARANJA X - COLUMNA CUOTA/PLAN: Es CRUCIAL que extraigas EXACTAMENTE lo que dice la columna "CUOTA/PLAN" en el campo 'plan'.
  Extrae CIERRE y VENCIMIENTO. Responde JSON puro rápido.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{ inlineData: { mimeType: "application/pdf", data: fileBase64 } }, { text: prompt }],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const result = JSON.parse(cleanJsonString(response.text || '{"transactions":[]}'));
    const normClosing = normalizeDate(result.closingDate);
    const normDue = normalizeDate(result.dueDate);
    
    const mappedTransactions = result.transactions.map((item: any) => {
      const txDate = normalizeDate(item.date);
      const targetPeriod = distributeToPeriod(txDate, normClosing, normDue);
      const isPostClosing = normClosing && new Date(txDate) > new Date(normClosing);
      
      const tx: Transaction = {
        id: `tx-${Math.random().toString(36).substr(2, 9)}`,
        date: txDate || new Date().toISOString().split('T')[0], 
        detail: item.detail,
        amount: item.amount,
        type: (item.installmentTotal > 1) ? TransactionType.INSTALLMENT : (item.type || TransactionType.PURCHASE),
        isInstallment: (item.installmentTotal || 0) > 1,
        installmentCurrent: item.installmentCurrent || 1,
        installmentTotal: item.installmentTotal || 1,
        bankName: bankProfile.name,
        targetPeriod,
        isPostClosing,
        statementClosingDate: normClosing,
        statementDueDate: normDue
      };
      
      (tx as any).rawPlan = item.plan;
      return tx;
    });

    return aggregateNaranjaZeta(mappedTransactions, bankProfile.name);
  } catch (error) {
    throw new Error("Error analizando el PDF.");
  }
};

export const parseTransactionsFromImages = async (
  imagesBase64: string[], 
  bankProfile: BankProfile
): Promise<Transaction[]> => {
  const ai = getAIClient();
  const prompt = `Extrae consumos de estas capturas de ${bankProfile.name}.
  NARANJA X: Mira la columna "CUOTA/PLAN" y pon su contenido en el campo 'plan'.`;
  
  const imageParts = imagesBase64.map(data => ({ inlineData: { mimeType: "image/png", data } }));

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...imageParts, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const result = JSON.parse(cleanJsonString(response.text || '{"transactions":[]}'));
    const normClosing = normalizeDate(result.closingDate);
    const normDue = normalizeDate(result.dueDate);

    const mappedTransactions = result.transactions.map((item: any) => {
      const txDate = normalizeDate(item.date);
      const targetPeriod = distributeToPeriod(txDate, normClosing, normDue);
      
      const tx: Transaction = {
        id: `tx-img-${Math.random().toString(36).substr(2, 9)}`,
        date: txDate || new Date().toISOString().split('T')[0], 
        detail: item.detail,
        amount: item.amount,
        type: (item.installmentTotal > 1) ? TransactionType.INSTALLMENT : (item.type || TransactionType.PURCHASE),
        isInstallment: (item.installmentTotal || 0) > 1,
        installmentCurrent: item.installmentCurrent || 1,
        installmentTotal: item.installmentTotal || 1,
        bankName: bankProfile.name,
        targetPeriod,
        statementClosingDate: normClosing,
        statementDueDate: normDue
      };
      
      (tx as any).rawPlan = item.plan;
      return tx;
    });

    return aggregateNaranjaZeta(mappedTransactions, bankProfile.name);
  } catch (error) {
    throw new Error("Error analizando capturas.");
  }
};

export const analyzeBankFormat = async (fileBase64: string): Promise<Partial<BankProfile>> => {
  const ai = getAIClient();
  const prompt = `Extrae metadata de este resumen bancario: 1. name, 2. columns, 3. currencySymbol, 4. closingDateKeywords, 5. dueDateKeywords. Responde JSON puro.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType: "application/pdf", data: fileBase64 } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          columns: { type: Type.ARRAY, items: { type: Type.STRING } },
          currencySymbol: { type: Type.STRING },
          dueDateKeywords: { type: Type.STRING },
          closingDateKeywords: { type: Type.STRING }
        }
      },
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  return JSON.parse(cleanJsonString(response.text || '{}'));
};

export const parseServiceBill = async (content: string, email: string, serviceName: string, keywords: string): Promise<BillExtractionResult> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Factura ${serviceName}: ${content}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          serviceName: { type: Type.STRING },
          date: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          currency: { type: Type.STRING }
        }
      },
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return JSON.parse(cleanJsonString(response.text || '{}'));
};

export const searchUserEmails = async (serviceName: string, keywords: string): Promise<string> => {
    const list = await fetchGmailMessages(`"${serviceName}" "${keywords}"`);
    if (!list.messages?.length) throw new Error("No mail");
    const detail = await fetchGmailMessageDetail(list.messages[0].id);
    return detail.snippet || "";
};
