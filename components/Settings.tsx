
import { Copy, Check, FileSpreadsheet, ExternalLink, ShieldAlert, X } from 'lucide-react';
import React, { useState } from 'react';

const APPS_SCRIPT_CODE = `function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    
    // --- 1. GUARDAR CONSUMOS (v5) ---
    if (action === "save_transactions") {
      var sheet = getOrCreateSheet(doc, "Consumos", ["id", "fecha", "detalle", "monto", "banco", "tipo", "cuota_actual", "cuota_total", "periodo_destino", "post_cierre", "fecha_cierre", "fecha_vencimiento", "fecha_importacion"]);
      var lastRow = sheet.getLastRow();
      var existingIds = [];
      if (lastRow > 1) {
        existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]); });
      }
      var newRows = [];
      data.data.forEach(function(r) {
        if (existingIds.indexOf(String(r.id)) === -1) {
           newRows.push([r.id, r.fecha, r.detalle, r.monto, r.banco, r.tipo, r.cuota_actual, r.cuota_total, r.periodo_destino, r.post_cierre, r.fecha_cierre, r.fecha_vencimiento, r.fecha_importacion]);
        }
      });
      if (newRows.length > 0) sheet.getRange(lastRow + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
      return successResponse({ "status": "success", "saved_count": newRows.length });
    } 
    
    // --- 2. OBTENER CONSUMOS ---
    else if (action === "get_transactions") {
      var sheet = doc.getSheetByName("Consumos");
      if (!sheet) return successResponse({ "status": "success", "data": [] });
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return successResponse({ "status": "success", "data": [] });
      var rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
      return successResponse({ "status": "success", "data": rows });
    }

    // --- 3. GASTOS FIJOS ---
    else if (action === "save_fixed_expenses") {
      var sheet = getOrCreateSheet(doc, "gastos_fijos", ["id", "nombre", "monto"]);
      sheet.clearContents();
      sheet.appendRow(["id", "nombre", "monto"]);
      if (data.data && data.data.length > 0) {
        var rows = data.data.map(function(e) { return [e.id, e.nombre, e.monto]; });
        sheet.getRange(2, 1, rows.length, 3).setValues(rows);
      }
      return successResponse({ "status": "success" });
    }

    else if (action === "get_fixed_expenses") {
      var sheet = doc.getSheetByName("gastos_fijos");
      if (!sheet || sheet.getLastRow() < 2) return successResponse({ "status": "success", "data": [] });
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
      return successResponse({ "status": "success", "data": rows });
    }

    // --- 4. CONFIGURACION ---
    else if (action === "save_income") {
      var sheet = getOrCreateSheet(doc, "config", ["key", "value"]);
      var values = sheet.getDataRange().getValues();
      var found = false;
      for (var i = 0; i < values.length; i++) {
        if (values[i][0] === "income") { sheet.getRange(i + 1, 2).setValue(data.data); found = true; break; }
      }
      if (!found) sheet.appendRow(["income", data.data]);
      return successResponse({ "status": "success" });
    }

    else if (action === "get_income") {
      var sheet = doc.getSheetByName("config");
      if (!sheet) return successResponse({ "status": "success", "data": 0 });
      var values = sheet.getDataRange().getValues();
      var income = 0;
      for (var i = 0; i < values.length; i++) { if (values[i][0] === "income") { income = values[i][1]; break; } }
      return successResponse({ "status": "success", "data": income });
    }

    // --- 5. BANCOS ---
    else if (action === "save_banks") {
      var sheet = getOrCreateSheet(doc, "Configuracion", ["id", "name", "columns", "currency", "identifiers", "dueDateKeywords", "closingDateKeywords"]);
      sheet.clearContents();
      sheet.appendRow(["id", "name", "columns", "currency", "identifiers", "dueDateKeywords", "closingDateKeywords"]);
      if (data.data && data.data.length > 0) {
        var rows = data.data.map(function(b) { return [b.id, b.name, b.columns, b.currency, b.identifiers, b.dueDateKeywords, b.closingDateKeywords]; });
        sheet.getRange(2, 1, rows.length, 7).setValues(rows);
      }
      return successResponse({ "status": "success" });
    }

    else if (action === "get_banks") {
      var sheet = doc.getSheetByName("Configuracion");
      if (!sheet || sheet.getLastRow() < 2) return successResponse({ "status": "success", "data": [] });
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
      return successResponse({ "status": "success", "data": rows });
    }
    
    return successResponse({ "result": "no_action" });

  } catch (e) {
    return successResponse({ "result": "error", "error": e.toString() });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); }
  return sheet;
}

function successResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}`;

const Settings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-3xl shadow-sm border border-slate-200 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="text-emerald-500" /> Configuración de Script
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={20}/></button>
      </div>
      <div className="space-y-6">
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
              <ShieldAlert className="text-amber-500 shrink-0" />
              <div>
                  <h4 className="font-bold text-amber-800 text-sm">Actualiza tu Script de Google (v5)</h4>
                  <p className="text-xs text-amber-700 leading-relaxed mt-1">
                    Copia este código nuevo (Versión 5), pégalo en tu Apps Script y vuelve a implementar para asegurar que se guarden correctamente las fechas de cierre y vencimiento.
                  </p>
              </div>
          </div>
          <div className="space-y-3">
              <div className="flex justify-between items-end px-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código Apps Script v5</p>
                <button onClick={handleCopy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-black'}`}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? '¡Copiado!' : 'Copiar Código'}
                </button>
              </div>
              <div className="bg-slate-900 rounded-2xl p-6 font-mono text-[10px] text-slate-300 overflow-auto max-h-[350px] border border-slate-800">
                  <pre>{APPS_SCRIPT_CODE}</pre>
              </div>
          </div>
          <div className="text-center pt-2">
             <a href="https://script.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-brand-600 hover:underline">
                Ir a Google Apps Script <ExternalLink size={12} />
             </a>
          </div>
      </div>
    </div>
  );
};

export default Settings;
