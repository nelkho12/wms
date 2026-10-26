import React, { useState } from 'react';
import { X, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, FileText, ArrowRight, Layers, Boxes } from 'lucide-react';
import { importSKUsFromCSV, importBatchesFromCSV } from '../services/api';
import { UserProfile } from '../types/roles';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  currentUser: UserProfile;
  existingSkus: string[];
  existingBatches: string[];
}

type ImportType = 'SKU' | 'BATCH';
type DuplicateMode = 'OVERWRITE' | 'SKIP_EXISTING' | 'MERGE_STOCK';

// Sample CSV Template Contents
const SKU_CSV_TEMPLATE = `sku,name,category,minStockLevel,reorderQuantity,unitCost,unit,storageZone,description,initialQty
CG-SAUCE-05,Catcher Gourmet Vanilla Bean Sauce,Sauces,15,50,14.50,Bottle,DRY,Rich natural vanilla bean dessert sauce,100
CG-SYRUP-09,Catcher Gourmet Hazelnut Flavored Syrup,Syrups,20,60,18.00,Bottle,DRY,Aromatic hazelnut specialty syrup,150
CG-POWDER-04,Catcher Gourmet Dark Cocoa Powder,Powders,10,30,22.50,Canister,DRY,Premium Dutch-processed dark cocoa,45`;

const BATCH_CSV_TEMPLATE = `batchNo,sku,manufactureDate,bestBeforeDate,quantityOnHand,locationId,supplier,unitCost,notes
BATCH-2026-901,CG-SAUCE-01,2026-02-01,2027-02-01,120,BAY-COLD-01,Catcher Gourmet Mfg,14.50,Initial Q1 Stock Receive
BATCH-2026-902,CG-SYRUP-01,2026-02-05,2027-08-05,80,BAY-DRY-03,Catcher Gourmet Mfg,18.00,Warehouse Aisle 2 Bay 3
BATCH-2026-903,CG-POWDER-01,2026-01-20,2026-11-20,50,BAY-HAZMAT-01,Catcher Gourmet Mfg,22.50,Special storage lot`;

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  existingSkus,
  existingBatches
}) => {
  const [importType, setImportType] = useState<ImportType>('SKU');
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('OVERWRITE');
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isOpen) return null;

  // Function to download CSV template files
  const handleDownloadTemplate = (type: ImportType) => {
    const content = type === 'SKU' ? SKU_CSV_TEMPLATE : BATCH_CSV_TEMPLATE;
    const filename = type === 'SKU' ? 'catcher_gourmet_sku_import_template.csv' : 'catcher_gourmet_batch_import_template.csv';

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Basic robust CSV line parser supporting quotes
  const parseCSVText = (text: string, mode: DuplicateMode = duplicateMode) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      setErrorMessage('CSV must contain a header row and at least one data row.');
      setParsedRows([]);
      return;
    }

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());
    const dataRows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

      const rowObj: Record<string, any> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = values[idx] !== undefined ? values[idx] : '';
      });

      // Validation logic
      let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
      let statusMsg = 'Ready to import';

      if (importType === 'SKU') {
        const skuVal = rowObj['sku'] || rowObj['product_sku'] || rowObj['item_code'];
        const nameVal = rowObj['name'] || rowObj['item_name'] || rowObj['title'];

        if (!skuVal || !nameVal) {
          status = 'ERROR';
          statusMsg = 'Missing SKU code or Name';
        } else if (existingSkus.includes(String(skuVal).toUpperCase())) {
          if (mode === 'OVERWRITE') {
            status = 'WARNING';
            statusMsg = 'Will overwrite existing SKU';
          } else if (mode === 'SKIP_EXISTING') {
            status = 'WARNING';
            statusMsg = 'Will skip (matches existing SKU)';
          } else {
            status = 'VALID';
            statusMsg = 'Will add +qty to existing stock';
          }
        } else {
          statusMsg = 'New SKU master record';
        }

        rowObj['_formatted'] = {
          sku: skuVal ? String(skuVal).trim().toUpperCase() : '',
          name: nameVal ? String(nameVal).trim() : '',
          category: rowObj['category'] || 'General Products',
          minStockLevel: Number(rowObj['minstocklevel'] || rowObj['min_stock']) || 20,
          reorderQuantity: Number(rowObj['reorderquantity'] || rowObj['reorder_qty']) || 50,
          unitCost: Number(rowObj['unitcost'] || rowObj['unit_cost'] || rowObj['price']) || 14.5,
          unit: rowObj['unit'] || 'Bottle',
          storageZone: rowObj['storagezone'] || rowObj['zone'] || 'DRY',
          description: rowObj['description'] || 'Imported via CSV',
          initialQty: Number(rowObj['initialqty'] || rowObj['currentqty'] || rowObj['qty']) || 0
        };
      } else {
        // BATCH Mode
        const batchVal = rowObj['batchno'] || rowObj['batch_no'] || rowObj['lot_number'];
        const skuVal = rowObj['sku'] || rowObj['item_code'];

        if (!batchVal || !skuVal) {
          status = 'ERROR';
          statusMsg = 'Missing Batch No or SKU';
        } else if (existingBatches.includes(String(batchVal).toUpperCase())) {
          if (mode === 'OVERWRITE') {
            status = 'WARNING';
            statusMsg = 'Will overwrite existing Batch';
          } else if (mode === 'SKIP_EXISTING') {
            status = 'WARNING';
            statusMsg = 'Will skip (matches existing Batch)';
          } else {
            status = 'VALID';
            statusMsg = 'Will add +qty to existing Batch';
          }
        } else {
          statusMsg = 'New Lot Batch record';
        }

        rowObj['_formatted'] = {
          batchNo: batchVal ? String(batchVal).trim().toUpperCase() : '',
          sku: skuVal ? String(skuVal).trim().toUpperCase() : '',
          manufactureDate: rowObj['manufacturedate'] || rowObj['mfg_date'] || new Date().toISOString().split('T')[0],
          bestBeforeDate: rowObj['bestbeforedate'] || rowObj['bbd'] || rowObj['expiry'] || new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
          quantityOnHand: Number(rowObj['quantityonhand'] || rowObj['qty'] || rowObj['quantity']) || 0,
          locationId: rowObj['locationid'] || rowObj['location'] || rowObj['bin'] || 'BAY-MAIN',
          supplier: rowObj['supplier'] || 'CSV Supplier',
          unitCost: Number(rowObj['unitcost'] || rowObj['cost']) || 14.5,
          notes: rowObj['notes'] || 'Imported via CSV'
        };
      }

      rowObj['_status'] = status;
      rowObj['_statusMsg'] = statusMsg;
      dataRows.push(rowObj);
    }

    setErrorMessage(null);
    setParsedRows(dataRows);
  };

  const handleModeChange = (newMode: DuplicateMode) => {
    setDuplicateMode(newMode);
    if (rawText.trim()) {
      parseCSVText(rawText, newMode);
    }
  };

  const handleFileUpload = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setErrorMessage('Please upload a valid .csv or .txt file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRawText(content);
      parseCSVText(content, duplicateMode);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawText(val);
    if (val.trim()) {
      parseCSVText(val, duplicateMode);
    } else {
      setParsedRows([]);
    }
  };

  const handleSubmitImport = async () => {
    const validItems = parsedRows
      .filter((r) => r._status !== 'ERROR')
      .map((r) => r._formatted);

    if (validItems.length === 0) {
      alert('No valid rows available to import.');
      return;
    }

    setIsSubmitting(true);
    try {
      const operatorName = `${currentUser.name} (${currentUser.role})`;
      if (importType === 'SKU') {
        const res = await importSKUsFromCSV(validItems, operatorName, duplicateMode);
        onSuccess(`✅ CSV SKU Import Successful! (${res.addedCount} New, ${res.updatedCount} Overwritten/Merged, ${res.skippedCount || 0} Skipped).`);
      } else {
        const res = await importBatchesFromCSV(validItems, operatorName, duplicateMode);
        onSuccess(`✅ CSV Batch Import Successful! (${res.addedCount} New, ${res.updatedCount} Overwritten/Merged, ${res.skippedCount || 0} Skipped).`);
      }
      onClose();
    } catch (err: any) {
      alert(`CSV Import Failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r._status !== 'ERROR').length;
  const errorCount = parsedRows.filter((r) => r._status === 'ERROR').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative text-slate-900 max-h-[90vh] flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-5 shrink-0">
          <div className="p-2.5 bg-blue-100 border border-blue-200 rounded-xl text-blue-700">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Inventory CSV Bulk Import & Template Generator</h3>
            <p className="text-xs text-slate-500">
              Bulk upload SKU master catalog data or lot batches from Excel/Spreadsheets with automated validation
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs & Template Download Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4 shrink-0">
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setImportType('SKU');
                setRawText('');
                setParsedRows([]);
              }}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                importType === 'SKU'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Import SKU Master Data</span>
            </button>

            <button
              onClick={() => {
                setImportType('BATCH');
                setRawText('');
                setParsedRows([]);
              }}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                importType === 'BATCH'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Import Lot Batches & Stock</span>
            </button>
          </div>

          {/* Download CSV Template Action */}
          <button
            onClick={() => handleDownloadTemplate(importType)}
            className="flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer shrink-0"
            title={`Download formatted standard template for ${importType === 'SKU' ? 'SKUs' : 'Batch Lots'}`}
          >
            <Download className="w-4 h-4" />
            <span>Download {importType === 'SKU' ? 'SKU' : 'Batch'} CSV Template (.csv)</span>
          </button>
        </div>

        {/* Duplicate Record Handling Options */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4 shrink-0">
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Option for Existing Data ({importType === 'SKU' ? 'Matching SKUs' : 'Matching Batches'}):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('OVERWRITE')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                duplicateMode === 'OVERWRITE'
                  ? 'bg-purple-50 border-purple-500 text-purple-950 font-bold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-xs font-bold text-purple-900">
                <span>🔄 Overwrite Existing</span>
              </div>
              <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                Update existing {importType} catalog & details with CSV data
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('SKIP_EXISTING')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                duplicateMode === 'SKIP_EXISTING'
                  ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-900">
                <span>🛡️ Keep Existing (Skip)</span>
              </div>
              <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                Match existing data and keep intact; only import new entries
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('MERGE_STOCK')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                duplicateMode === 'MERGE_STOCK'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-900">
                <span>➕ Match & Add Stock</span>
              </div>
              <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                Retain catalog details & accumulate CSV quantity to stock
              </p>
            </button>
          </div>
        </div>

        {/* Drag & Drop File Upload Area */}
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
              isDragOver ? 'border-blue-500 bg-blue-50/70' : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'
            }`}
          >
            <input
              type="file"
              accept=".csv,.txt"
              id="csv-file-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <label htmlFor="csv-file-input" className="cursor-pointer flex flex-col items-center justify-center">
              <Upload className="w-8 h-8 text-blue-500 mb-2" />
              <span className="text-xs font-bold text-slate-800">
                Click to choose CSV file or drag & drop here
              </span>
              <span className="text-[11px] text-slate-500 mt-1">
                Supports standard .CSV files exported from Excel, Google Sheets, or ERP systems
              </span>
            </label>
          </div>

          {/* Direct Text Paste Option */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Or Paste Raw CSV Text directly below:</label>
              {parsedRows.length > 0 && (
                <span className="text-[11px] font-semibold text-slate-500">
                  Parsed <span className="text-blue-600 font-bold">{parsedRows.length}</span> rows
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={rawText}
              onChange={handleTextChange}
              placeholder={
                importType === 'SKU'
                  ? 'sku,name,category,minStockLevel,reorderQuantity,unitCost,unit,storageZone,initialQty\nCG-SAUCE-05,Catcher Gourmet Vanilla Bean Sauce,Sauces,15,50,14.50,Bottle,DRY,100'
                  : 'batchNo,sku,manufactureDate,bestBeforeDate,quantityOnHand,locationId,supplier\nBATCH-2026-901,CG-SAUCE-01,2026-02-01,2027-02-01,120,BAY-COLD-01,Catcher Gourmet Mfg'
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Validation Table Preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Validation Preview Table:</span>
                <div className="flex items-center space-x-3">
                  <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {validCount} Valid / Ready
                  </span>
                  {errorCount > 0 && (
                    <span className="text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                      {errorCount} Error Row(s)
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-2">Status</th>
                      {importType === 'SKU' ? (
                        <>
                          <th className="p-2">SKU</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Category</th>
                          <th className="p-2 text-right">Unit Cost</th>
                          <th className="p-2 text-right">Initial Qty</th>
                        </>
                      ) : (
                        <>
                          <th className="p-2">Batch No</th>
                          <th className="p-2">SKU</th>
                          <th className="p-2">Location</th>
                          <th className="p-2">BBD / Expiry</th>
                          <th className="p-2 text-right">Quantity</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {parsedRows.map((row, idx) => {
                      const formatted = row._formatted || {};
                      return (
                        <tr key={idx} className={row._status === 'ERROR' ? 'bg-rose-50/60' : 'hover:bg-slate-50'}>
                          <td className="p-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center space-x-1 ${
                                row._status === 'ERROR'
                                  ? 'bg-rose-100 text-rose-800'
                                  : row._status === 'WARNING'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              <span>{row._statusMsg}</span>
                            </span>
                          </td>
                          {importType === 'SKU' ? (
                            <>
                              <td className="p-2 font-bold text-slate-900">{formatted.sku || '-'}</td>
                              <td className="p-2 text-slate-800 font-sans">{formatted.name || '-'}</td>
                              <td className="p-2 text-slate-600 font-sans">{formatted.category}</td>
                              <td className="p-2 text-right text-slate-700">${formatted.unitCost?.toFixed(2)}</td>
                              <td className="p-2 text-right font-bold text-blue-700">{formatted.initialQty}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-2 font-bold text-slate-900">{formatted.batchNo || '-'}</td>
                              <td className="p-2 text-slate-800">{formatted.sku || '-'}</td>
                              <td className="p-2 text-slate-600">{formatted.locationId}</td>
                              <td className="p-2 text-slate-600">{formatted.bestBeforeDate}</td>
                              <td className="p-2 text-right font-bold text-blue-700">{formatted.quantityOnHand}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => handleDownloadTemplate(importType)}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold underline flex items-center space-x-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Sample CSV Template</span>
          </button>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || validCount === 0}
              onClick={handleSubmitImport}
              className={`px-5 py-2 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5 transition-all ${
                validCount === 0
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Importing Data...' : `Commit & Import ${validCount} Row(s)`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
