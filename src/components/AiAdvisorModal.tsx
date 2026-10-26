import React, { useState, useEffect } from 'react';
import { Sparkles, X, RefreshCw, ShieldCheck, Zap, Boxes } from 'lucide-react';
import { fetchGeminiInventoryInsights } from '../services/api';

interface AiAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiAdvisorModal: React.FC<AiAdvisorModalProps> = ({ isOpen, onClose }) => {
  const [insights, setInsights] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadInsights = async () => {
    setIsLoading(true);
    try {
      const res = await fetchGeminiInventoryInsights();
      setInsights(res);
    } catch (err: any) {
      setInsights(`Failed to generate insights: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !insights) {
      loadInsights();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-purple-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 relative text-slate-900">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl text-white shadow-md">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center space-x-2">
              <span>Gemini AI Warehouse Intelligence Advisor</span>
            </h3>
            <p className="text-xs text-purple-700 font-medium">
              Automated Slotting, Expiry Waste Prevention & Route Analysis
            </p>
          </div>
        </div>

        <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
              <p className="text-xs text-purple-700 font-mono">Analyzing warehouse batches & aisle picking velocity...</p>
            </div>
          ) : (
            <div className="prose max-w-none text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
              {insights}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2">
          <button
            onClick={loadInsights}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-analyze Warehouse</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-lg shadow-sm"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
