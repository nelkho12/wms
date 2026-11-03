import React, { useState, useEffect } from 'react';
import {
  Bot,
  Key,
  Copy,
  Check,
  RefreshCw,
  Play,
  Code2,
  Terminal,
  ShieldCheck,
  Send,
  Eye,
  EyeOff,
  FileCode,
  AlertCircle,
  Clock,
  Cpu,
  ArrowRight,
  Database,
  Sparkles
} from 'lucide-react';
import {
  fetchAgentApiDetails,
  regenerateAgentApiKey,
  fetchAgentTools,
  executeAgentToolCall,
  sendAgentChatMessage,
  AgentToolItem
} from '../services/api';
import { UserProfile } from '../types/roles';

interface AiAgentApiViewProps {
  currentUser: UserProfile;
}

export const AiAgentApiView: React.FC<AiAgentApiViewProps> = ({ currentUser }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedCurl, setCopiedCurl] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(true);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);

  // Tools state
  const [tools, setTools] = useState<AgentToolItem[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('get_warehouse_status');
  const [toolParamsJson, setToolParamsJson] = useState<string>('{}');
  const [isExecutingTool, setIsExecutingTool] = useState<boolean>(false);
  const [toolExecutionResult, setToolExecutionResult] = useState<any>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);

  // Chat testing state
  const [chatInput, setChatInput] = useState<string>('Which batches are expiring within the next 30 days?');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'agent'; text: string; time: string }>>([
    {
      sender: 'agent',
      text: 'ApexWMS Autonomous Agent connected. You can test natural language warehouse queries or use the programmatic API tools below.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);

  // Active code snippet tab
  const [snippetTab, setSnippetTab] = useState<'curl' | 'python' | 'ts' | 'openai'>('curl');

  // Load API details and tools
  const loadData = async () => {
    setIsLoadingDetails(true);
    try {
      const details = await fetchAgentApiDetails();
      setApiKey(details.apiKey || '');
      setBaseUrl(details.baseUrl || `${window.location.origin}/api/agent/v1`);
    } catch {
      // Fallback if not admin/manager
      setBaseUrl(`${window.location.origin}/api/agent/v1`);
      setApiKey('');
    }

    try {
      const toolsData = await fetchAgentTools();
      if (toolsData && toolsData.tools) {
        setTools(toolsData.tools);
        if (toolsData.tools.length > 0) {
          setSelectedTool(toolsData.tools[0].name);
          loadSampleParams(toolsData.tools[0].name);
        }
      }
    } catch (err) {
      console.warn('Failed to load agent tools:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const shownKey = apiKey || 'YOUR_API_KEY';

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopySnippet = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCurl(id);
    setTimeout(() => setCopiedCurl(null), 2000);
  };

  const handleRegenerateKey = async () => {
    if (currentUser.role !== 'Admin') {
      alert('Only administrators can regenerate the AI Agent API key.');
      return;
    }
    if (!window.confirm('Regenerate AI Agent API key?\n\nAny existing external agents, background tasks, or scripts using the current key will lose access immediately until updated.')) {
      return;
    }
    setIsRegenerating(true);
    try {
      const res = await regenerateAgentApiKey();
      setApiKey(res.apiKey);
      setShowKey(true);
      alert(res.message || 'New AI Agent API key created. Copy it now - it will not be shown again.');
    } catch (err: any) {
      alert(`Failed to regenerate API key: ${err.message}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const loadSampleParams = (toolName: string) => {
    let sample: Record<string, any> = {};
    switch (toolName) {
      case 'get_warehouse_status':
        sample = {};
        break;
      case 'search_inventory':
        sample = { query: 'PAR', limit: 10 };
        break;
      case 'get_sku_details':
        sample = { sku: 'PAR-500' };
        break;
      case 'get_expiring_batches':
        sample = { withinDays: 30, limit: 10 };
        break;
      case 'get_quarantined_batches':
        sample = {};
        break;
      case 'quarantine_batch':
        sample = { batchNo: 'B-2024-001', quarantined: true, reason: 'Inspection hold by AI Agent' };
        break;
      case 'get_locations':
        sample = { zone: 'Ambient', aisle: 'A' };
        break;
      case 'list_orders':
        sample = { status: 'PENDING', limit: 5 };
        break;
      case 'get_order_details':
        sample = { orderId: 'ORD-1001' };
        break;
      case 'receive_stock':
        sample = {
          sku: 'PAR-500',
          batchNo: `LOT-${Math.floor(1000 + Math.random() * 9000)}`,
          quantity: 100,
          locationId: 'A-01-01',
          bestBeforeDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          supplier: 'PharmaSupply Direct'
        };
        break;
      case 'adjust_stock':
        sample = { batchNo: 'B-2024-001', newQuantity: 150, reason: 'AI automated cycle count verification' };
        break;
      case 'move_stock':
        sample = { batchNo: 'B-2024-001', toLocationId: 'A-01-02' };
        break;
      case 'optimize_pick_route':
        sample = { locationIds: 'A-01-01, A-02-03, B-01-02' };
        break;
      case 'execute_sql_query':
        sample = { query: 'SELECT TOP 10 SKU, ItemName, StorageZone FROM dbo.Inventory' };
        break;
      default:
        sample = {};
    }
    setToolParamsJson(JSON.stringify(sample, null, 2));
  };

  const handleToolSelect = (name: string) => {
    setSelectedTool(name);
    loadSampleParams(name);
    setToolExecutionResult(null);
    setExecutionTimeMs(null);
  };

  const handleExecuteTool = async () => {
    setIsExecutingTool(true);
    setToolExecutionResult(null);
    const start = performance.now();
    try {
      let parsed = {};
      try {
        parsed = JSON.parse(toolParamsJson);
      } catch {
        alert('Invalid JSON in parameters field');
        setIsExecutingTool(false);
        return;
      }
      const res = await executeAgentToolCall(selectedTool, parsed);
      setExecutionTimeMs(Math.round(performance.now() - start));
      setToolExecutionResult(res);
    } catch (err: any) {
      setExecutionTimeMs(Math.round(performance.now() - start));
      setToolExecutionResult({ success: false, error: err.message || 'Execution failed' });
    } finally {
      setIsExecutingTool(false);
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = chatInput.trim();
    if (!text || isSendingChat) return;

    const userMsg = {
      sender: 'user' as const,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const res = await sendAgentChatMessage(text);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: res.reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: `Error communicating with agent: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const currentOrigin = window.location.origin;
  const effectiveBaseUrl = baseUrl || `${currentOrigin}/api/agent/v1`;

  // Code snippets generator
  const getCurlSnippet = () => {
    return `# 1. Check warehouse status\ncurl -X GET "${effectiveBaseUrl}/status" \\\n  -H "X-API-Key: ${shownKey}"\n\n# 2. Search inventory for a SKU\ncurl -X GET "${effectiveBaseUrl}/inventory?query=PAR" \\\n  -H "X-API-Key: ${shownKey}"\n\n# 3. Universal tool execution\ncurl -X POST "${effectiveBaseUrl}/execute" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${shownKey}" \\\n  -d '{\n    "tool": "${selectedTool}",\n    "parameters": ${toolParamsJson.replace(/\n/g, '\n    ')}\n  }'`;
  };

  const getPythonSnippet = () => {
    return `import requests

BASE_URL = "${effectiveBaseUrl}"
HEADERS = {
    "X-API-Key": "${shownKey}",
    "Content-Type": "application/json"
}

# Check real-time warehouse metrics
status = requests.get(f"{BASE_URL}/status", headers=HEADERS).json()
print("Total SKUs:", status.get("totalSkus"))

# Execute a tool
payload = {
    "tool": "${selectedTool}",
    "parameters": ${toolParamsJson.replace(/\n/g, '\n    ')}
}
response = requests.post(f"{BASE_URL}/execute", headers=HEADERS, json=payload).json()
print("Tool Execution Result:", response)`;
  };

  const getTsSnippet = () => {
    return `const BASE_URL = '${effectiveBaseUrl}';
const API_KEY = '${shownKey}';

// 1. Fetch expiring lots (FEFO compliance)
async function checkExpiringBatches() {
  const res = await fetch(\`\${BASE_URL}/batches?withinDays=30\`, {
    headers: { 'X-API-Key': API_KEY }
  });
  return await res.json();
}

// 2. Execute any warehouse tool
async function runTool(toolName: string, parameters: Record<string, any>) {
  const res = await fetch(\`\${BASE_URL}/execute\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({ tool: toolName, parameters })
  });
  return await res.json();
}`;
  };

  const getOpenAiSnippet = () => {
    return `// Ready for LangChain, OpenAI Assistants, or Gemini Function Calling
import OpenAI from "openai";

const client = new OpenAI();

// Fetch tools directly from ApexWMS at startup
const toolsResponse = await fetch("${effectiveBaseUrl}/tools");
const { tools } = await toolsResponse.json();

// Convert to OpenAI tool format
const formattedTools = tools.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }
}));

// When the model calls a tool, forward it to ApexWMS:
async function handleToolCall(toolCall) {
  const res = await fetch("${effectiveBaseUrl}/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "${shownKey}"
    },
    body: JSON.stringify({
      tool: toolCall.function.name,
      parameters: JSON.parse(toolCall.function.arguments)
    })
  });
  return await res.json();
}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-white tracking-tight">AI Agent API</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  API v1 Live
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  OpenAPI 3.0
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Programmatic REST endpoints and autonomous tool-calling specifications for LLM agents, LangChain, AutoGen, and warehouse automation robots.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={`${effectiveBaseUrl}/openapi.json`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 transition"
            >
              <FileCode className="w-4 h-4 text-emerald-400" />
              OpenAPI JSON Spec
            </a>
            <a
              href={`${effectiveBaseUrl}/tools`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2 transition"
            >
              <Cpu className="w-4 h-4" />
              View Tool Catalog ({tools.length})
            </a>
          </div>
        </div>
      </div>

      {/* API Key & Authentication Credentials Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Agent Credentials & Authentication</h2>
              <p className="text-xs text-slate-400">Pass key via <code className="text-emerald-400 font-mono">X-API-Key</code> header or as <code className="text-emerald-400 font-mono">Authorization: Bearer &lt;key&gt;</code></p>
            </div>
          </div>

          {currentUser.role === 'Admin' && (
            <button
              onClick={handleRegenerateKey}
              disabled={isRegenerating}
              className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
              Regenerate Key
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Base Endpoint URL</label>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
              <span className="text-xs font-mono text-emerald-400 flex-1 truncate">{effectiveBaseUrl}</span>
              <button
                onClick={() => handleCopySnippet(effectiveBaseUrl, 'base-url')}
                className="text-slate-400 hover:text-white p-1 rounded transition"
                title="Copy Base URL"
              >
                {copiedCurl === 'base-url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Active API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Live Agent API Key</span>
              <span className="text-emerald-400 font-normal">Agent API access only</span>
            </label>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
              <span className="text-xs font-mono text-amber-300 flex-1 truncate">
                {!apiKey
                  ? 'Hidden for safety - create a new key to see one'
                  : showKey
                  ? apiKey
                  : apiKey.replace(/.(?=.{4})/g, '•')}
              </span>
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={handleCopyKey}
                className="text-slate-400 hover:text-white p-1 rounded transition"
                title="Copy API Key"
              >
                {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Tool Console & Quickstart Snippets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Tool Console (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Interactive Agent Tool Console</h3>
                <p className="text-xs text-slate-400">Test autonomous tools directly with live execution feedback</p>
              </div>
            </div>

            <button
              onClick={handleExecuteTool}
              disabled={isExecutingTool}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              <Play className={`w-3.5 h-3.5 fill-current ${isExecutingTool ? 'animate-pulse' : ''}`} />
              {isExecutingTool ? 'Executing...' : 'Execute Tool'}
            </button>
          </div>

          {/* Tool Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Select Tool to Test</label>
            <select
              value={selectedTool}
              onChange={(e) => handleToolSelect(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} - {t.description.slice(0, 70)}...
                </option>
              ))}
            </select>
          </div>

          {/* Selected Tool Details */}
          {tools.find((t) => t.name === selectedTool) && (
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs space-y-1">
              <span className="font-semibold text-emerald-400">Description:</span>
              <p className="text-slate-300">{tools.find((t) => t.name === selectedTool)?.description}</p>
            </div>
          )}

          {/* JSON Parameters Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">Parameters (JSON)</label>
              <button
                onClick={() => loadSampleParams(selectedTool)}
                className="text-xs text-emerald-400 hover:underline"
              >
                Reset to sample parameters
              </button>
            </div>
            <textarea
              rows={5}
              value={toolParamsJson}
              onChange={(e) => setToolParamsJson(e.target.value)}
              className="w-full bg-slate-950 font-mono text-xs text-emerald-300 border border-slate-700 rounded-xl p-3 focus:outline-none focus:border-emerald-500 leading-relaxed"
            />
          </div>

          {/* Execution Result Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">Execution Output</label>
              {executionTimeMs !== null && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  {executionTimeMs} ms
                </span>
              )}
            </div>
            <div className="w-full min-h-[140px] max-h-[260px] overflow-auto bg-slate-950 font-mono text-xs border border-slate-800 rounded-xl p-3.5">
              {isExecutingTool ? (
                <div className="flex items-center gap-2 text-slate-400 py-6 justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  Executing tool dispatch on ApexWMS server...
                </div>
              ) : toolExecutionResult ? (
                <pre className={`text-xs ${toolExecutionResult.success ? 'text-slate-200' : 'text-red-400'}`}>
                  {JSON.stringify(toolExecutionResult, null, 2)}
                </pre>
              ) : (
                <div className="text-slate-500 italic py-6 text-center">
                  Select a tool above, tweak parameters if needed, and click "Execute Tool" to test live response.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Code Snippets & Quickstart (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Agent Integration Snippets</h3>
                  <p className="text-xs text-slate-400">Copy-paste into your agent project</p>
                </div>
              </div>

              <button
                onClick={() => {
                  let text = '';
                  if (snippetTab === 'curl') text = getCurlSnippet();
                  if (snippetTab === 'python') text = getPythonSnippet();
                  if (snippetTab === 'ts') text = getTsSnippet();
                  if (snippetTab === 'openai') text = getOpenAiSnippet();
                  handleCopySnippet(text, snippetTab);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Copy current snippet"
              >
                {copiedCurl === snippetTab ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Language Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setSnippetTab('curl')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                  snippetTab === 'curl' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                cURL
              </button>
              <button
                onClick={() => setSnippetTab('python')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                  snippetTab === 'python' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Python
              </button>
              <button
                onClick={() => setSnippetTab('ts')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                  snippetTab === 'ts' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TypeScript
              </button>
              <button
                onClick={() => setSnippetTab('openai')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                  snippetTab === 'openai' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                OpenAI/Gemini
              </button>
            </div>

            {/* Code Block */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-emerald-300 overflow-auto max-h-[380px] leading-relaxed">
              <pre className="whitespace-pre">
                {snippetTab === 'curl' && getCurlSnippet()}
                {snippetTab === 'python' && getPythonSnippet()}
                {snippetTab === 'ts' && getTsSnippet()}
                {snippetTab === 'openai' && getOpenAiSnippet()}
              </pre>
            </div>
          </div>

          <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-semibold text-emerald-200">Zero-Configuration M2M Access:</span>
              <p className="text-emerald-400/90 mt-0.5">
                All agent actions are audited with <code className="font-mono bg-emerald-950 px-1 py-0.5 rounded">Apex AI Agent</code> attribution in the warehouse audit log.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Natural Language Agent Query Playground */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Natural Language Agent Query Playground</h3>
              <p className="text-xs text-slate-400">Ask questions in natural language, backed by Gemini with real-time warehouse data</p>
            </div>
          </div>

          <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
            POST /api/agent/v1/chat
          </span>
        </div>

        {/* Chat History Container */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-72 overflow-y-auto space-y-3">
          {chatMessages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none'
                    : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                }`}
              >
                <div className="font-semibold text-[10px] mb-1 opacity-70">
                  {m.sender === 'user' ? 'You (Tester)' : 'Apex AI Agent'} • {m.time}
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}
          {isSendingChat && (
            <div className="flex items-center gap-2 text-slate-400 text-xs italic py-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
              Agent is analyzing live warehouse state...
            </div>
          )}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSendChat} className="flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="e.g. Which batches are expiring soon? or Check stock level of PAR-500..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isSendingChat}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Send Query
          </button>
        </form>
      </div>
    </div>
  );
};
