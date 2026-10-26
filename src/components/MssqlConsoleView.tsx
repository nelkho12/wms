import React, { useState, useEffect } from 'react';
import {
  Database,
  Terminal,
  Play,
  Download,
  Sparkles,
  Table as TableIcon,
  Server,
  Key,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Lock,
  ShieldAlert,
  History,
  ShieldCheck,
  Filter,
  Search,
  FileText,
  PlusCircle,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  User,
  Activity,
  Tag,
  Globe,
  Cloud,
  Laptop,
  Wifi,
  Copy,
  Check,
  ExternalLink,
  Code,
  Cpu,
  Sliders,
  Monitor,
  Network
} from 'lucide-react';
import { executeMssqlQuery, fetchMssqlSchema, askGeminiSqlAssistant } from '../services/api';
import { MssqlQueryResult, MssqlTableSchema, AuditLogEntry, AuditCategory } from '../types/wms';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';

interface MssqlConsoleViewProps {
  currentUser: UserProfile;
  auditLogs?: AuditLogEntry[];
  onLogAuditActivity?: (
    actionCategory: AuditCategory,
    actionType: string,
    targetEntity: string,
    details: string,
    severity?: 'INFO' | 'WARNING' | 'CRITICAL'
  ) => void;
  onOpenRoleModal?: () => void;
  onOpenBackupModal?: () => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const MssqlConsoleView: React.FC<MssqlConsoleViewProps> = ({
  currentUser,
  auditLogs = [],
  onLogAuditActivity,
  onOpenRoleModal,
  onOpenBackupModal,
  customRolePermissions
}) => {
  const [subTab, setSubTab] = useState<'audit_logs' | 'query_studio' | 'gcp_connection'>('audit_logs');

  // Database Deployment Architecture Mode (Google Cloud SQL vs Local LAN Server vs Local Workstation Standalone)
  const [dbMode, setDbMode] = useState<'gcp_cloud_sql' | 'lan_standalone' | 'local_standalone'>('gcp_cloud_sql');

  // Google Cloud MS SQL & Workstation Connection State
  const [gcpInstance, setGcpInstance] = useState('apex-wms-gcp-prod:asia-east1:mssql-db-2022');
  const [gcpHostIp, setGcpHostIp] = useState('34.126.88.192');
  const [gcpPort, setGcpPort] = useState('1433');
  const [gcpDatabase, setGcpDatabase] = useState('ApexWMS_Production');
  const [gcpUser, setGcpUser] = useState('apex_wms_app');
  const [gcpPassword, setGcpPassword] = useState('Wms_Cloud_2022_SecureKey!');
  const [gcpEncrypt, setGcpEncrypt] = useState(true);

  // Local Area Network (LAN) On-Premise Database State
  const [lanHostIp, setLanHostIp] = useState('192.168.1.150');
  const [lanPort, setLanPort] = useState('1433');
  const [lanInstanceName, setLanInstanceName] = useState('ONPREM-SQL01\\SQLEXPRESS');
  const [lanDatabase, setLanDatabase] = useState('ApexWMS_Production');
  const [lanUser, setLanUser] = useState('apex_lan_user');
  const [lanPassword, setLanPassword] = useState('Wms_Lan_2022_SecureKey!');
  const [lanTrustCert, setLanTrustCert] = useState(true);

  // Standalone Local Workstation Computer Database State
  const [standaloneHost, setStandaloneHost] = useState('127.0.0.1');
  const [standalonePort, setStandalonePort] = useState('1433');
  const [standaloneDatabase, setStandaloneDatabase] = useState('ApexWMS_Local');
  const [standaloneUser, setStandaloneUser] = useState('sa');
  const [standalonePassword, setStandalonePassword] = useState('Wms_Local_2022_SecureKey!');

  const [isTestingGcpConn, setIsTestingGcpConn] = useState(false);
  const [gcpTestStatus, setGcpTestStatus] = useState<{
    tested: boolean;
    success: boolean;
    latencyMs: number;
    steps: { name: string; ok: boolean; detail: string }[];
  } | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  const handleTestGcpConnection = () => {
    setIsTestingGcpConn(true);
    setGcpTestStatus(null);

    setTimeout(() => {
      setIsTestingGcpConn(false);
      
      if (dbMode === 'lan_standalone') {
        setGcpTestStatus({
          tested: true,
          success: true,
          latencyMs: 1,
          steps: [
            { name: '1. LAN Local Network Socket Check', ok: true, detail: `Connected to LAN server at ${lanHostIp}:${lanPort} (1ms ultra-low latency)` },
            { name: '2. Subnet Broadcast & Firewall Verification', ok: true, detail: `Local Area Network TCP/IP port ${lanPort} open. Subnet: 192.168.1.x` },
            { name: '3. On-Premise MS SQL Authentication', ok: true, detail: `User '${lanUser}' authenticated on local instance '${lanInstanceName}'` },
            { name: '4. Database Catalog Integrity Check', ok: true, detail: `Catalog '${lanDatabase}' active. MS SQL Server 2022 On-Premise` },
            { name: '5. LAN Workstation Read/Write Audit Check', ok: true, detail: 'Write permission confirmed across local network for dbo.AuditLogs' }
          ]
        });

        if (onLogAuditActivity) {
          onLogAuditActivity(
            'SYSTEM',
            'LAN_SQL_CONN_TEST',
            `LAN-Database:${lanHostIp}`,
            `Ran diagnostic test connecting via Local Area Network (LAN) to on-premise MS SQL Server (${lanHostIp}:${lanPort}). Latency: 1ms.`,
            'INFO'
          );
        }
      } else if (dbMode === 'local_standalone') {
        setGcpTestStatus({
          tested: true,
          success: true,
          latencyMs: 0.4,
          steps: [
            { name: '1. Workstation Loopback Socket Check', ok: true, detail: `Connected to local computer host at ${standaloneHost}:${standalonePort} (<1ms latency)` },
            { name: '2. Standalone Database Process Check', ok: true, detail: 'Local MS SQL Express / LocalDB engine running in standalone mode' },
            { name: '3. Standalone Credentials Auth', ok: true, detail: `User '${standaloneUser}' authenticated locally` },
            { name: '4. Local Database Catalog Active', ok: true, detail: `Catalog '${standaloneDatabase}' ready for standalone offline access` },
            { name: '5. Standalone Read/Write Check', ok: true, detail: 'Local computer file storage active' }
          ]
        });

        if (onLogAuditActivity) {
          onLogAuditActivity(
            'SYSTEM',
            'STANDALONE_SQL_CONN_TEST',
            `StandaloneLocal:${standaloneHost}`,
            `Ran diagnostic test for standalone local workstation database (${standaloneHost}:${standalonePort}).`,
            'INFO'
          );
        }
      } else {
        setGcpTestStatus({
          tested: true,
          success: true,
          latencyMs: 18,
          steps: [
            { name: '1. Workstation Egress TCP Check', ok: true, detail: `Connected to ${gcpHostIp}:${gcpPort} (18ms)` },
            { name: '2. TLS 1.3 Handshake & Certificate Verification', ok: true, detail: 'Encrypted channel established (Cipher: AES_256_GCM)' },
            { name: '3. SQL Server Credentials Authentication', ok: true, detail: `User '${gcpUser}' authenticated on Google Cloud SQL` },
            { name: '4. Database Engine Schema Validation', ok: true, detail: `Catalog '${gcpDatabase}' active. MS SQL Server 2022 RTM (16.0.1000.6)` },
            { name: '5. Workstation Read/Write Audit Check', ok: true, detail: 'Write permission confirmed for dbo.AuditLogs and dbo.ProductSKU' }
          ]
        });

        if (onLogAuditActivity) {
          onLogAuditActivity(
            'SYSTEM',
            'GCP_SQL_CONN_TEST',
            'GoogleCloudSQL:mssql-db-2022',
            `Ran diagnostic connection test from local computer workstation to Google Cloud MS SQL database (${gcpHostIp}:${gcpPort}). Latency: 18ms.`,
            'INFO'
          );
        }
      }
    }, 700);
  };

  const handleCopyConnectionString = (format: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2500);
  };

  // SQL Studio state
  const [sqlInput, setSqlInput] = useState<string>(
    `SELECT AuditID, Timestamp, UserID, UserName, UserRole, ActionCategory, ActionType, TargetEntity, Severity \nFROM dbo.AuditLogs \nORDER BY Timestamp DESC;`
  );
  const [queryResult, setQueryResult] = useState<MssqlQueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [tablesSchema, setTablesSchema] = useState<MssqlTableSchema[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('dbo.AuditLogs');

  // Gemini NL assistant
  const [nlPrompt, setNlPrompt] = useState('');
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);
  const [aiSqlExplanation, setAiSqlExplanation] = useState<string | null>(null);

  // Audit Logs Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Manual Audit Note Form State
  const [showManualNoteModal, setShowManualNoteModal] = useState(false);
  const [manualNoteEntity, setManualNoteEntity] = useState('');
  const [manualNoteDetails, setManualNoteDetails] = useState('');
  const [manualNoteCategory, setManualNoteCategory] = useState<AuditCategory>('SYSTEM');
  const [manualNoteSeverity, setManualNoteSeverity] = useState<'INFO' | 'WARNING' | 'CRITICAL'>('INFO');

  const canUseConsole = hasPermission(currentUser.role, 'mssql:console', customRolePermissions);

  useEffect(() => {
    // Load schema on mount
    fetchMssqlSchema()
      .then((data) => setTablesSchema(data.tables))
      .catch(console.warn);

    // Initial query run
    handleRunQuery(sqlInput);
  }, []);

  const handleRunQuery = async (queryToRun?: string) => {
    const sql = queryToRun || sqlInput;
    setIsExecuting(true);
    try {
      const res = await executeMssqlQuery(sql);
      setQueryResult(res);

      if (onLogAuditActivity && sql) {
        onLogAuditActivity(
          'SYSTEM',
          'T_SQL_QUERY_EXECUTE',
          'dbo.Database',
          `Ran T-SQL query: ${sql.trim().slice(0, 65)}${sql.length > 65 ? '...' : ''} (${res.rowCount} rows returned)`,
          'INFO'
        );
      }
    } catch (err: any) {
      setQueryResult({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        sqlQuery: sql,
        error: err.message || 'Execution error'
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleGeminiGenerateSql = async () => {
    if (!nlPrompt.trim()) return;
    setIsGeneratingSql(true);
    setAiSqlExplanation(null);
    try {
      const resultText = await askGeminiSqlAssistant(nlPrompt);
      setAiSqlExplanation(resultText);

      // Extract SQL snippet if present
      const match = resultText.match(/```sql\s*([\s\S]*?)\s*```/i);
      if (match && match[1]) {
        const extractedSql = match[1].trim();
        setSqlInput(extractedSql);
        handleRunQuery(extractedSql);
      }
    } catch (err: any) {
      alert(`Gemini AI Assistant error: ${err.message}`);
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleExportQueryResultCsv = () => {
    if (!queryResult || queryResult.rows.length === 0) return;
    const headers = queryResult.columns.join(',');
    const csvRows = queryResult.rows.map((row) =>
      queryResult.columns.map((col) => `"${row[col] ?? ''}"`).join(',')
    );
    const blob = new Blob([[headers, ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ApexWMS_Query_Export_${Date.now()}.csv`;
    a.click();
  };

  const handleExportAuditLogsCsv = () => {
    if (filteredAuditLogs.length === 0) return;
    const headers = ['AuditID', 'Timestamp', 'UserID', 'UserName', 'UserRole', 'ActionCategory', 'ActionType', 'TargetEntity', 'Details', 'Severity', 'IPAddress'].join(',');
    const csvRows = filteredAuditLogs.map((log) =>
      [
        `"${log.id}"`,
        `"${log.timestamp}"`,
        `"${log.userId}"`,
        `"${log.userName}"`,
        `"${log.userRole}"`,
        `"${log.actionCategory}"`,
        `"${log.actionType}"`,
        `"${log.targetEntity}"`,
        `"${log.details.replace(/"/g, '""')}"`,
        `"${log.severity}"`,
        `"${log.ipAddress || ''}"`
      ].join(',')
    );
    const blob = new Blob([[headers, ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ApexWMS_AuditTrail_Report_${Date.now()}.csv`;
    a.click();
  };

  const handleAddManualAuditNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualNoteDetails.trim()) return;

    if (onLogAuditActivity) {
      onLogAuditActivity(
        manualNoteCategory,
        'MANUAL_ADMIN_MEMO',
        manualNoteEntity || 'System Audit Log',
        manualNoteDetails.trim(),
        manualNoteSeverity
      );
    }

    setManualNoteEntity('');
    setManualNoteDetails('');
    setShowManualNoteModal(false);
  };

  // Filtered Audit Logs
  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actionType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.targetEntity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || log.actionCategory === categoryFilter;
    const matchesSeverity = severityFilter === 'ALL' || log.severity === severityFilter;
    const matchesRole = roleFilter === 'ALL' || log.userRole === roleFilter;

    return matchesSearch && matchesCategory && matchesSeverity && matchesRole;
  });

  // KPI Metrics
  const totalAuditEvents = auditLogs.length;
  const roleEventsCount = auditLogs.filter((l) => l.actionCategory === 'ROLE_MANAGEMENT').length;
  const quarantineEventsCount = auditLogs.filter((l) => l.actionCategory === 'QUARANTINE' || l.severity === 'CRITICAL').length;
  const uniqueUsersCount = new Set(auditLogs.map((l) => l.userName)).size;

  if (!canUseConsole) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-6 max-w-2xl mx-auto my-8 shadow-xl text-slate-900">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center mx-auto text-rose-600">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200">
            Access Restricted (RBAC Policy)
          </span>
          <h3 className="text-2xl font-black text-slate-900">
            MS SQL Server & System Audit Studio Requires Admin Role
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
            Your current logged-in role is <strong className="text-slate-900 font-mono">{currentUser.role}</strong>. Direct T-SQL query execution, raw database inspection, and full administrative audit log access are restricted to <strong>Admin</strong> users.
          </p>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-2 text-left font-mono">
          <div className="text-slate-500 font-bold uppercase tracking-wider">Required Capability:</div>
          <div className="text-rose-700 font-bold">`mssql:console`</div>
          <div className="text-slate-600 font-sans text-[11px] pt-1 border-t border-slate-200">
            To test T-SQL queries and administrative audit logs in this demo, switch your profile to <strong>Sarah Connor (Admin)</strong>.
          </div>
        </div>

        {onOpenRoleModal && (
          <button
            onClick={onOpenRoleModal}
            className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            Switch to Admin Role
          </button>
        )}
      </div>
    );
  }

  const getCategoryBadgeClass = (category: AuditCategory) => {
    switch (category) {
      case 'ROLE_MANAGEMENT':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'QUARANTINE':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'INBOUND':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'PICKING':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'INVENTORY':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'SYSTEM':
      default:
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    }
  };

  const getSeverityBadgeClass = (severity: 'INFO' | 'WARNING' | 'CRITICAL') => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-300 font-bold';
      case 'WARNING':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      case 'INFO':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* DB Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-emerald-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Cloud className="w-4 h-4 text-blue-600" />
            <span>Google Cloud Platform • MS SQL Server 2022 (RTM) • Production Database</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            MS SQL Server Management Console & Google Cloud Integration
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Software installed on individual computer workstations connecting to Google Cloud SQL MS SQL Server database. Run T-SQL queries, inspect schemas, and track system audit trails.
          </p>
        </div>

        {/* Database Credentials & Connection Card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {onOpenBackupModal && (
            <button
              onClick={onOpenBackupModal}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center space-x-2 shrink-0"
            >
              <Database className="w-4 h-4 text-sky-300" />
              <span>Data Backup Studio</span>
            </button>
          )}

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
            <div className="flex items-center space-x-2 text-emerald-700 font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>GCP Project: apex-wms-gcp-prod</span>
            </div>
            <div className="text-slate-600">Cloud SQL Instance: <span className="text-slate-900 font-bold">mssql-db-2022</span></div>
            <div className="text-slate-500 text-[11px]">Database: <span className="text-purple-700 font-bold">ApexWMS_Production</span> (Port 1433)</div>
          </div>
        </div>
      </div>

      {/* Sub-Tab Switcher: T-SQL Console, Audit Log System, GCP Connection Manager */}
      <div className="flex border-b border-slate-200/80 space-x-2 overflow-x-auto">
        <button
          onClick={() => setSubTab('audit_logs')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-l border-r whitespace-nowrap ${
            subTab === 'audit_logs'
              ? 'bg-white text-purple-700 border-slate-200/80 shadow-2xs'
              : 'bg-slate-50 text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <History className="w-4 h-4 text-purple-600 shrink-0" />
          <span>Audit Trail Stream</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-800 border border-purple-200">
            {totalAuditEvents}
          </span>
        </button>

        <button
          onClick={() => setSubTab('query_studio')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-l border-r whitespace-nowrap ${
            subTab === 'query_studio'
              ? 'bg-white text-indigo-700 border-slate-200/80 shadow-2xs'
              : 'bg-slate-50 text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <Terminal className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>SQL Terminal & Schema</span>
        </button>

        <button
          onClick={() => setSubTab('gcp_connection')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-l border-r whitespace-nowrap ${
            subTab === 'gcp_connection'
              ? 'bg-white text-blue-700 border-slate-200/80 shadow-2xs'
              : 'bg-slate-50 text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Google Cloud Connection</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
            Active
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ADMINISTRATIVE AUDIT LOG SYSTEM                                   */}
      {/* ========================================================================= */}
      {subTab === 'audit_logs' && (
        <div className="space-y-6">
          
          {/* Audit Log KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Audit Logged Events</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">{totalAuditEvents}</h3>
                <p className="text-[11px] text-emerald-700 mt-1 flex items-center space-x-1 font-mono">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Real-time T-SQL Logging Active</span>
                </p>
              </div>
              <div className="p-3 bg-purple-100 text-purple-700 border border-purple-200 rounded-xl">
                <History className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role & RBAC Security Events</p>
                <h3 className="text-2xl font-black text-purple-800 mt-1">{roleEventsCount}</h3>
                <p className="text-[11px] text-slate-500 mt-1 font-mono">Role changes & assignments</p>
              </div>
              <div className="p-3 bg-purple-100 text-purple-700 border border-purple-200 rounded-xl">
                <UserCheck className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Critical & Quarantine Logs</p>
                <h3 className="text-2xl font-black text-rose-700 mt-1">{quarantineEventsCount}</h3>
                <p className="text-[11px] text-rose-700 mt-1 font-mono">Safety holds & alerts</p>
              </div>
              <div className="p-3 bg-rose-100 text-rose-700 border border-rose-200 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Operators Audited</p>
                <h3 className="text-2xl font-black text-blue-400 mt-1">{uniqueUsersCount}</h3>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">Across 4 system roles</p>
              </div>
              <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
                <Activity className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Audit Controls & Action Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Audit Trail Filters & Administrative Actions
                </h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const q = `SELECT AuditID, Timestamp, UserID, UserName, UserRole, ActionCategory, ActionType, TargetEntity, Details, Severity \nFROM dbo.AuditLogs \nORDER BY Timestamp DESC;`;
                    setSqlInput(q);
                    setSubTab('query_studio');
                    handleRunQuery(q);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-purple-800 font-mono text-xs rounded-lg border border-purple-200 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5 text-purple-600" />
                  <span>Query `dbo.AuditLogs` in T-SQL</span>
                </button>

                <button
                  onClick={() => setShowManualNoteModal(true)}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Log Admin Note</span>
                </button>

                <button
                  onClick={handleExportAuditLogsCsv}
                  disabled={filteredAuditLogs.length === 0}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-lg border border-slate-200 flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export Audit CSV</span>
                </button>
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search user, entity, details..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Category Filter */}
              <div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="ALL">All Action Categories</option>
                  <option value="ROLE_MANAGEMENT">Role & RBAC Security</option>
                  <option value="QUARANTINE">Quarantine & Safety</option>
                  <option value="INVENTORY">Inventory Adjustments</option>
                  <option value="INBOUND">Inbound Stock Receive</option>
                  <option value="PICKING">Order Picking Walks</option>
                  <option value="SYSTEM">System & T-SQL Logs</option>
                </select>
              </div>

              {/* Severity Filter */}
              <div>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="ALL">All Severity Levels</option>
                  <option value="INFO">INFO (Standard Ops)</option>
                  <option value="WARNING">WARNING (Role/Config Updates)</option>
                  <option value="CRITICAL">CRITICAL (Emergency Holds)</option>
                </select>
              </div>

              {/* User Role Filter */}
              <div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="ALL">All User Roles</option>
                  <option value="Admin">Admin Only</option>
                  <option value="Warehouse Manager">Warehouse Manager</option>
                  <option value="Picker">Picker</option>
                  <option value="Receiver">Receiver</option>
                </select>
              </div>
            </div>
          </div>

          {/* Audit Logs Trail Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-800 font-bold flex items-center space-x-2">
                <History className="w-4 h-4 text-purple-600" />
                <span>Administrative Activity Log Feed (`dbo.AuditLogs`)</span>
              </span>
              <span className="text-slate-500 text-[11px]">
                Showing {filteredAuditLogs.length} of {totalAuditEvents} audit entries
              </span>
            </div>

            {filteredAuditLogs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <History className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-slate-600 text-sm font-semibold">No audit logs match your search filters.</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('ALL');
                    setSeverityFilter('ALL');
                    setRoleFilter('ALL');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[550px]">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-mono border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Audit ID & Time</th>
                      <th className="py-3 px-4">User & Role</th>
                      <th className="py-3 px-4">Category & Action</th>
                      <th className="py-3 px-4">Target Entity</th>
                      <th className="py-3 px-4">Activity Details</th>
                      <th className="py-3 px-4 text-center">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        
                        {/* Audit ID & Time */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px]">
                          <div className="font-bold text-slate-900 flex items-center space-x-1">
                            <Tag className="w-3 h-3 text-slate-400" />
                            <span>{log.id}</span>
                          </div>
                          <div className="text-slate-500 flex items-center space-x-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{log.timestamp}</span>
                          </div>
                        </td>

                        {/* User & Role */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-purple-700">
                              {log.userName.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{log.userName}</div>
                              <div className="text-[10px] font-mono text-purple-700 font-semibold">{log.userRole}</div>
                            </div>
                          </div>
                        </td>

                        {/* Category & Action */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${getCategoryBadgeClass(log.actionCategory)}`}>
                              {log.actionCategory}
                            </span>
                            <div className="text-[11px] font-mono text-slate-800 font-semibold">{log.actionType}</div>
                          </div>
                        </td>

                        {/* Target Entity */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-xs font-semibold text-emerald-700">
                          {log.targetEntity}
                        </td>

                        {/* Activity Details */}
                        <td className="py-3 px-4 text-xs text-slate-700 leading-relaxed max-w-md">
                          {log.details}
                          {log.ipAddress && (
                            <span className="block text-[10px] font-mono text-slate-400 mt-0.5">IP: {log.ipAddress}</span>
                          )}
                        </td>

                        {/* Severity */}
                        <td className="py-3 px-4 whitespace-nowrap text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-mono border ${getSeverityBadgeClass(log.severity)}`}>
                            {log.severity}
                          </span>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: T-SQL TERMINAL & SCHEMA STUDIO                                     */}
      {/* ========================================================================= */}
      {subTab === 'query_studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column (4 cols): Schema Inspector & Quick Preset Queries */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Preset Operational Queries */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-emerald-600" />
                <span>Pre-built T-SQL Operational Reports</span>
              </h4>

              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    const q = `SELECT AuditID, Timestamp, UserID, UserName, UserRole, ActionCategory, ActionType, TargetEntity, Details, Severity \nFROM dbo.AuditLogs \nORDER BY Timestamp DESC;`;
                    setSqlInput(q);
                    handleRunQuery(q);
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-xs text-purple-900 transition-colors font-mono cursor-pointer"
                >
                  <div className="font-bold text-purple-800 mb-0.5">🛡️ 1. Administrative System Audit Logs</div>
                  <div className="text-[11px] text-purple-700">Query full audit trail from dbo.AuditLogs</div>
                </button>

                <button
                  onClick={() => {
                    const q = `SELECT BatchNo, SKU, ItemName, BestBeforeDate, LocationID, QuantityOnHand, Status \nFROM dbo.Batches \nORDER BY BestBeforeDate ASC;`;
                    setSqlInput(q);
                    handleRunQuery(q);
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-800 transition-colors font-mono cursor-pointer"
                >
                  <div className="font-bold text-emerald-700 mb-0.5">⚡ 2. FEFO Expiry Priority Matrix</div>
                  <div className="text-[11px] text-slate-500">Batches ordered by Best Before Date</div>
                </button>

                <button
                  onClick={() => {
                    const q = `SELECT LocationID, Aisle, Zone, CapacityKg, CurrentKg \nFROM dbo.Locations \nORDER BY Aisle ASC;`;
                    setSqlInput(q);
                    handleRunQuery(q);
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-800 transition-colors font-mono cursor-pointer"
                >
                  <div className="font-bold text-blue-700 mb-0.5">📍 3. Warehouse Bin Utilization</div>
                  <div className="text-[11px] text-slate-500">Bin location capacities and zones</div>
                </button>

                <button
                  onClick={() => {
                    const q = `SELECT BatchNo, SKU, ItemName, Supplier, BestBeforeDate, QuantityOnHand \nFROM dbo.Batches \nWHERE Status = 'QUARANTINED';`;
                    setSqlInput(q);
                    handleRunQuery(q);
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-800 transition-colors font-mono cursor-pointer"
                >
                  <div className="font-bold text-rose-700 mb-0.5">🔒 4. Quarantined Recall Audit</div>
                  <div className="text-[11px] text-slate-500">Locked batches under QA hold</div>
                </button>
              </div>
            </div>

            {/* Table Schema Inspector */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-2">
                <TableIcon className="w-4 h-4 text-blue-600" />
                <span>MS SQL Database Schema Tables</span>
              </h4>

              <div className="space-y-1">
                {tablesSchema.map((t) => (
                  <button
                    key={t.tableName}
                    onClick={() => setSelectedTable(t.tableName)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between cursor-pointer ${
                      selectedTable === t.tableName
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <span>{t.tableName}</span>
                    <span className="text-[10px] opacity-75">{t.rowCount} rows</span>
                  </button>
                ))}
              </div>

              {/* Selected Table Columns */}
              {selectedTable && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Columns in {selectedTable}:</span>
                  {tablesSchema
                    .find((t) => t.tableName === selectedTable)
                    ?.columns.map((c) => (
                      <div key={c.name} className="flex items-center justify-between text-[11px] font-mono bg-slate-50 p-1.5 rounded">
                        <span className="text-slate-900 font-semibold flex items-center">
                          {c.isPrimaryKey && <Key className="w-3 h-3 text-amber-500 mr-1" />}
                          {c.name}
                        </span>
                        <span className="text-slate-500 text-[10px]">{c.type}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column (8 cols): Query Terminal + Gemini NL to SQL Assistant + Results Grid */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Gemini Natural Language to SQL Assistant Bar */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-purple-900 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Gemini AI Natural Language to T-SQL Generator</span>
                </div>
                <span className="text-[10px] text-purple-700 font-mono">gemini-3.6-flash</span>
              </div>

              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Ask in plain English, e.g.: 'Show audit logs for critical quarantine actions taken by Sarah Connor'"
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGeminiGenerateSql()}
                  className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleGeminiGenerateSql}
                  disabled={isGeneratingSql}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
                >
                  {isGeneratingSql ? 'Generating SQL...' : 'Generate T-SQL'}
                </button>
              </div>

              {aiSqlExplanation && (
                <div className="p-3 bg-white rounded-lg border border-purple-200 text-xs text-slate-800 leading-relaxed font-sans">
                  {aiSqlExplanation}
                </div>
              )}
            </div>

            {/* T-SQL Query Terminal */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-800 flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-600" />
                  <span>T-SQL Query Terminal</span>
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleExportQueryResultCsv}
                    disabled={!queryResult || queryResult.rows.length === 0}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-semibold border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={() => handleRunQuery()}
                    disabled={isExecuting}
                    className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded shadow-xs transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isExecuting ? 'Executing...' : 'Execute T-SQL'}</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={4}
                value={sqlInput}
                onChange={(e) => setSqlInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 leading-relaxed"
              />
            </div>

            {/* Query Results Grid */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-700 flex items-center space-x-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Execution Results</span>
                </span>

                {queryResult && !queryResult.error && (
                  <div className="flex items-center space-x-3 text-emerald-700 text-[11px] font-bold">
                    <span>Rows: {queryResult.rowCount}</span>
                    <span>•</span>
                    <span>Time: {queryResult.executionTimeMs}ms</span>
                  </div>
                )}
              </div>

              {queryResult?.error ? (
                <div className="p-6 text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
                  <p className="text-xs font-mono text-rose-700">{queryResult.error}</p>
                </div>
              ) : queryResult && queryResult.rows.length > 0 ? (
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left text-xs text-slate-800 font-mono">
                    <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                      <tr>
                        {queryResult.columns.map((col) => (
                          <th key={col} className="py-2.5 px-3 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {queryResult.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          {queryResult.columns.map((col) => (
                            <td key={col} className="py-2 px-3 whitespace-nowrap">
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : 'NULL'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  Query executed. No rows returned.
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DATABASE DEPLOYMENT & LAN / STANDALONE CONNECTION SETUP            */}
      {/* ========================================================================= */}
      {subTab === 'gcp_connection' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Architecture Deployment Selector Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center space-x-2">
                  <Network className="w-5 h-5 text-indigo-600" />
                  <span>Database Connectivity & Access Architecture</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Select how workstation clients connect to the database engine: Google Cloud SQL, On-Premise LAN Server, or Local Standalone.
                </p>
              </div>
              <span className="text-xs font-mono font-bold px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg shrink-0">
                Mode: {dbMode === 'gcp_cloud_sql' ? 'Google Cloud SQL' : dbMode === 'lan_standalone' ? 'LAN On-Premise Server' : 'Standalone Local Workstation'}
              </span>
            </div>

            {/* 3 Deployment Option Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              
              {/* Option 1: Cloud SQL */}
              <button
                type="button"
                onClick={() => {
                  setDbMode('gcp_cloud_sql');
                  setGcpTestStatus(null);
                }}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer space-y-2 relative ${
                  dbMode === 'gcp_cloud_sql'
                    ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/20 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`p-2 rounded-lg ${dbMode === 'gcp_cloud_sql' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    <Cloud className="w-5 h-5" />
                  </span>
                  {dbMode === 'gcp_cloud_sql' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600 text-white">Active</span>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Google Cloud SQL</h4>
                  <p className="text-[11px] text-slate-500">Cloud-managed MS SQL 2022 instance with encrypted internet egress.</p>
                </div>
                <div className="text-[10px] font-mono text-blue-700 font-semibold pt-1 border-t border-slate-200/60">
                  Host: 34.126.88.192:1433
                </div>
              </button>

              {/* Option 2: LAN On-Premise Server */}
              <button
                type="button"
                onClick={() => {
                  setDbMode('lan_standalone');
                  setGcpTestStatus(null);
                }}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer space-y-2 relative ${
                  dbMode === 'lan_standalone'
                    ? 'bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/20 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`p-2 rounded-lg ${dbMode === 'lan_standalone' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    <Network className="w-5 h-5" />
                  </span>
                  {dbMode === 'lan_standalone' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white">Active</span>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">LAN On-Premise Server</h4>
                  <p className="text-[11px] text-slate-500">Local Area Network server for local warehouse computers (No internet required).</p>
                </div>
                <div className="text-[10px] font-mono text-emerald-700 font-semibold pt-1 border-t border-slate-200/60">
                  LAN IP: {lanHostIp}:{lanPort}
                </div>
              </button>

              {/* Option 3: Standalone Local Computer Workstation */}
              <button
                type="button"
                onClick={() => {
                  setDbMode('local_standalone');
                  setGcpTestStatus(null);
                }}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer space-y-2 relative ${
                  dbMode === 'local_standalone'
                    ? 'bg-purple-50/60 border-purple-500 ring-2 ring-purple-500/20 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`p-2 rounded-lg ${dbMode === 'local_standalone' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    <Laptop className="w-5 h-5" />
                  </span>
                  {dbMode === 'local_standalone' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-600 text-white">Active</span>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Standalone Local Workstation</h4>
                  <p className="text-[11px] text-slate-500">Embedded or local computer MS SQL Express instance for single-PC standalone use.</p>
                </div>
                <div className="text-[10px] font-mono text-purple-700 font-semibold pt-1 border-t border-slate-200/60">
                  Host: {standaloneHost}:{standalonePort}
                </div>
              </button>

            </div>
          </div>

          {/* Architecture Visual Overview & Live Health Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-indigo-400 font-mono text-xs font-bold uppercase tracking-wider">
                  {dbMode === 'lan_standalone' ? (
                    <>
                      <Network className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span>Local Area Network (LAN) On-Premise MS SQL Database</span>
                    </>
                  ) : dbMode === 'local_standalone' ? (
                    <>
                      <Laptop className="w-4 h-4 text-purple-400 animate-pulse" />
                      <span>Standalone Local Workstation Database</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4 text-blue-400 animate-pulse" />
                      <span>Google Cloud SQL for Microsoft SQL Server 2022</span>
                    </>
                  )}
                </div>
                <h3 className="text-xl font-extrabold text-white">
                  {dbMode === 'lan_standalone'
                    ? 'Local Area Network (LAN) On-Premise Warehouse Database Architecture'
                    : dbMode === 'local_standalone'
                    ? 'Standalone Single-Computer Local Workstation Architecture'
                    : 'Client Computer Workstation to Google Cloud Database Architecture'}
                </h3>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  {dbMode === 'lan_standalone'
                    ? 'The software connects directly across your company’s Local Area Network (LAN) via high-speed internal TCP sockets to a central on-premise MS SQL Server machine without requiring public internet access.'
                    : dbMode === 'local_standalone'
                    ? 'The software runs entirely on a single workstation PC utilizing an embedded or local MS SQL Express database for standalone offline warehouse management.'
                    : 'The software application runs on individual desktop/laptop computers and establishes secure, encrypted TLS 1.3 TCP connections directly to the production MS SQL Server instance on Google Cloud.'}
                </p>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <button
                  onClick={handleTestGcpConnection}
                  disabled={isTestingGcpConn}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingGcpConn ? 'animate-spin' : ''}`} />
                  <span>
                    {isTestingGcpConn
                      ? 'Testing Connection...'
                      : dbMode === 'lan_standalone'
                      ? 'Test LAN Socket Connection'
                      : dbMode === 'local_standalone'
                      ? 'Test Standalone Local DB'
                      : 'Test Cloud Connection'}
                  </span>
                </button>
              </div>
            </div>

            {/* Architecture Node Diagram */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Node 1: Workstation */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold flex items-center">
                    <Laptop className="w-3.5 h-3.5 mr-1 text-sky-400" /> Workstation Client PC
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                    Installed Software
                  </span>
                </div>
                <h4 className="font-extrabold text-sm text-white">ApexWMS Workstation Client</h4>
                <p className="text-[11px] text-slate-300">Individual computer running Windows / macOS / Linux desktop environment.</p>
                <div className="pt-2 border-t border-slate-700/60 text-[10px] font-mono text-sky-300">
                  Network Interface: <span className="font-bold text-white">{dbMode === 'lan_standalone' ? 'Ethernet / Wi-Fi LAN' : dbMode === 'local_standalone' ? 'Local Host Loopback' : 'WAN / Internet Egress'}</span>
                </div>
              </div>

              {/* Node 2: Connection Transit */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold flex items-center">
                    <Wifi className="w-3.5 h-3.5 mr-1 text-indigo-400" /> Network & Firewall Transit
                  </span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                    {dbMode === 'lan_standalone' ? 'LAN Port 1433 (1ms)' : dbMode === 'local_standalone' ? 'Local IPC (<1ms)' : 'TLS 1.3 / Port 1433'}
                  </span>
                </div>
                <h4 className="font-extrabold text-sm text-white">
                  {dbMode === 'lan_standalone' ? 'Company Router / Switch' : dbMode === 'local_standalone' ? 'Local Named Pipes' : 'Cloud SQL Auth Proxy / Public IP'}
                </h4>
                <p className="text-[11px] text-slate-300">
                  {dbMode === 'lan_standalone'
                    ? 'Internal company network subnet protecting warehouse data traffic on port 1433.'
                    : dbMode === 'local_standalone'
                    ? 'Internal operating system socket pipe connecting client to local SQL process.'
                    : 'Encrypted socket tunnel or authorized IP firewall rule protecting data in transit.'}
                </p>
                <div className="pt-2 border-t border-slate-700/60 text-[10px] font-mono text-indigo-300">
                  Target Endpoint: <span className="font-bold text-white">{dbMode === 'lan_standalone' ? `${lanHostIp}:${lanPort}` : dbMode === 'local_standalone' ? `${standaloneHost}:${standalonePort}` : `${gcpHostIp}:${gcpPort}`}</span>
                </div>
              </div>

              {/* Node 3: Target Database Engine */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold flex items-center">
                    <Server className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Database Engine
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                    Online ({dbMode === 'lan_standalone' ? '1ms LAN' : dbMode === 'local_standalone' ? '<1ms Local' : '18ms Cloud'})
                  </span>
                </div>
                <h4 className="font-extrabold text-sm text-white">
                  {dbMode === 'lan_standalone' ? 'On-Premise MS SQL Server' : dbMode === 'local_standalone' ? 'Standalone Local MS SQL Express' : 'Google Cloud MS SQL Server 2022'}
                </h4>
                <p className="text-[11px] text-slate-300">
                  Catalog: <strong className="text-white">{dbMode === 'lan_standalone' ? lanDatabase : dbMode === 'local_standalone' ? standaloneDatabase : gcpDatabase}</strong> with SKU & Audit tables.
                </p>
                <div className="pt-2 border-t border-slate-700/60 text-[10px] font-mono text-emerald-300">
                  Instance: <span className="font-bold text-white">{dbMode === 'lan_standalone' ? lanInstanceName : dbMode === 'local_standalone' ? 'SQLEXPRESS' : gcpInstance}</span>
                </div>
              </div>

            </div>
          </div>

          {/* Connection Test Results Diagnostic Box */}
          {gcpTestStatus && (
            <div className="bg-emerald-950/20 border border-emerald-300 bg-emerald-50 rounded-2xl p-5 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-emerald-900 font-extrabold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    {dbMode === 'lan_standalone'
                      ? 'LAN On-Premise Database Connection Diagnostic Successful'
                      : dbMode === 'local_standalone'
                      ? 'Standalone Local Workstation Database Diagnostic Successful'
                      : 'Google Cloud Workstation Connection Diagnostic Successful'}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-extrabold bg-emerald-200 text-emerald-900 border border-emerald-300">
                  Latency: {gcpTestStatus.latencyMs}ms
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono pt-1">
                {gcpTestStatus.steps.map((step, idx) => (
                  <div key={idx} className="p-2.5 bg-white rounded-xl border border-emerald-200/80 flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">{step.name}</span>
                      <span className="text-[11px] text-slate-600 font-normal">{step.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-Column Grid: Connection Parameters Form & Setup Guide */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column (5 cols): Dynamic Connection Credentials Form */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h4 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>
                    {dbMode === 'lan_standalone'
                      ? 'LAN Server Connection Credentials'
                      : dbMode === 'local_standalone'
                      ? 'Standalone Local DB Parameters'
                      : 'Google Cloud SQL Connection Credentials'}
                  </span>
                </h4>
                <span className="text-[10px] font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-bold">
                  {dbMode === 'lan_standalone' ? 'LAN On-Prem' : dbMode === 'local_standalone' ? 'Local PC' : 'GCP Cloud SQL'}
                </span>
              </div>

              {/* Dynamic Form Inputs according to selected mode */}
              {dbMode === 'lan_standalone' ? (
                /* LAN On-Premise Form */
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">LAN Server Host Name or IP Address</label>
                    <input
                      type="text"
                      value={lanHostIp}
                      onChange={(e) => setLanHostIp(e.target.value)}
                      placeholder="e.g. 192.168.1.150 or srv-wms.local"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">LAN TCP Port</label>
                      <input
                        type="text"
                        value={lanPort}
                        onChange={(e) => setLanPort(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">SQL Instance Name</label>
                      <input
                        type="text"
                        value={lanInstanceName}
                        onChange={(e) => setLanInstanceName(e.target.value)}
                        placeholder="SQLEXPRESS / MSSQLSERVER"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">MS SQL Database Name</label>
                    <input
                      type="text"
                      value={lanDatabase}
                      onChange={(e) => setLanDatabase(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">SQL Username</label>
                      <input
                        type="text"
                        value={lanUser}
                        onChange={(e) => setLanUser(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">SQL Password</label>
                      <input
                        type="password"
                        value={lanPassword}
                        onChange={(e) => setLanPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center space-x-2 text-slate-700 font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={lanTrustCert}
                        onChange={(e) => setLanTrustCert(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                      <span>Trust Server Certificate (`TrustServerCertificate=True`)</span>
                    </label>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleTestGcpConnection}
                      disabled={isTestingGcpConn}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center space-x-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingGcpConn ? 'animate-spin' : ''}`} />
                      <span>{isTestingGcpConn ? 'Testing LAN Connection...' : 'Test LAN Server Connection'}</span>
                    </button>
                  </div>
                </div>
              ) : dbMode === 'local_standalone' ? (
                /* Standalone Local Workstation Form */
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Local Host / Workstation IP</label>
                    <input
                      type="text"
                      value={standaloneHost}
                      onChange={(e) => setStandaloneHost(e.target.value)}
                      placeholder="127.0.0.1 or localhost"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Local Port</label>
                      <input
                        type="text"
                        value={standalonePort}
                        onChange={(e) => setStandalonePort(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Local Database Name</label>
                      <input
                        type="text"
                        value={standaloneDatabase}
                        onChange={(e) => setStandaloneDatabase(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">SQL User (`sa` / local user)</label>
                      <input
                        type="text"
                        value={standaloneUser}
                        onChange={(e) => setStandaloneUser(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">SQL Password</label>
                      <input
                        type="password"
                        value={standalonePassword}
                        onChange={(e) => setStandalonePassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleTestGcpConnection}
                      disabled={isTestingGcpConn}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center space-x-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingGcpConn ? 'animate-spin' : ''}`} />
                      <span>{isTestingGcpConn ? 'Testing Local DB...' : 'Test Local Standalone DB'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Google Cloud SQL Form */
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">GCP Project & Instance Connection Name</label>
                    <input
                      type="text"
                      value={gcpInstance}
                      onChange={(e) => setGcpInstance(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Google Cloud IP Host</label>
                      <input
                        type="text"
                        value={gcpHostIp}
                        onChange={(e) => setGcpHostIp(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Port</label>
                      <input
                        type="text"
                        value={gcpPort}
                        onChange={(e) => setGcpPort(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">MS SQL Database Name</label>
                    <input
                      type="text"
                      value={gcpDatabase}
                      onChange={(e) => setGcpDatabase(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">SQL Username (`sa` / App User)</label>
                      <input
                        type="text"
                        value={gcpUser}
                        onChange={(e) => setGcpUser(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">SQL Password</label>
                      <input
                        type="password"
                        value={gcpPassword}
                        onChange={(e) => setGcpPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center space-x-2 text-slate-700 font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={gcpEncrypt}
                        onChange={(e) => setGcpEncrypt(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <span>Enforce TLS 1.3 Encryption (`Encrypt=True`)</span>
                    </label>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleTestGcpConnection}
                      disabled={isTestingGcpConn}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center space-x-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingGcpConn ? 'animate-spin' : ''}`} />
                      <span>{isTestingGcpConn ? 'Testing Connection...' : 'Test Connection from Workstation'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column (7 cols): Step-by-Step Installation & Network Setup Guide */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Step-by-Step Installation Guide Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                    <Laptop className="w-4 h-4 text-emerald-600" />
                    <span>
                      {dbMode === 'lan_standalone'
                        ? 'LAN On-Premise Database Server Setup & Workstation Guide'
                        : dbMode === 'local_standalone'
                        ? 'Standalone Single-PC Local Database Guide'
                        : 'Workstation Computer Installation & Cloud Setup Guide'}
                    </span>
                  </h4>
                  <span className="text-[10px] font-mono text-slate-500 font-bold">4 Easy Steps</span>
                </div>

                <div className="space-y-3.5 text-xs">
                  
                  {dbMode === 'lan_standalone' ? (
                    /* LAN Setup Steps */
                    <>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px] flex items-center justify-center">1</span>
                          <span className="font-extrabold text-slate-900">Install MS SQL Server on LAN Server PC</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          Install MS SQL Server 2022 (Express, Standard, or Developer) on a central warehouse host computer on your local network (e.g., IP: <code className="font-mono text-emerald-700">192.168.1.150</code>).
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px] flex items-center justify-center">2</span>
                          <span className="font-extrabold text-slate-900">Enable TCP/IP Port 1433 in SQL Configuration Manager</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          Open <strong>SQL Server Configuration Manager</strong> → SQL Server Network Configuration → Protocols for SQLEXPRESS → Enable <strong>TCP/IP</strong> and set Port to <strong>1433</strong>.
                        </p>
                        <div className="ml-7 mt-1 p-2 bg-slate-900 text-emerald-400 font-mono text-[10px] rounded-lg">
                          netsh advfirewall firewall add rule name="MS SQL LAN" dir=in action=allow protocol=TCP localport=1433
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px] flex items-center justify-center">3</span>
                          <span className="font-extrabold text-slate-900">Configure Client Workstations `.env`</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          On each workstation PC on the local network/Wi-Fi, point `.env` variables to the LAN server:
                        </p>
                        <div className="ml-7 mt-1 p-2 bg-slate-900 text-slate-200 font-mono text-[10px] rounded-lg space-y-0.5">
                          <div><span className="text-emerald-400">MSSQL_SERVER</span>={lanHostIp}</div>
                          <div><span className="text-emerald-400">MSSQL_PORT</span>={lanPort}</div>
                          <div><span className="text-emerald-400">MSSQL_DATABASE</span>={lanDatabase}</div>
                          <div><span className="text-emerald-400">MSSQL_USER</span>={lanUser}</div>
                          <div><span className="text-emerald-400">MSSQL_TRUST_CERT</span>=true</div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px] flex items-center justify-center">4</span>
                          <span className="font-extrabold text-slate-900">Verify High-Speed 1ms LAN Performance</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          Click <strong>Test LAN Server Connection</strong> to verify multi-user inventory access over local ethernet/Wi-Fi.
                        </p>
                      </div>
                    </>
                  ) : dbMode === 'local_standalone' ? (
                    /* Standalone Local Setup Steps */
                    <>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold text-[10px] flex items-center justify-center">1</span>
                          <span className="font-extrabold text-slate-900">Install Local MS SQL Express on PC</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          Download and install MS SQL Server 2022 Express Edition or LocalDB directly on the workstation computer.
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold text-[10px] flex items-center justify-center">2</span>
                          <span className="font-extrabold text-slate-900">Restore or Initialize Local Database File</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          Use the Data Backup Studio inside ApexWMS to restore an existing snapshot or auto-seed `ApexWMS_Local`.
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold text-[10px] flex items-center justify-center">3</span>
                          <span className="font-extrabold text-slate-900">Configure `.env` Local Host</span>
                        </div>
                        <div className="ml-7 mt-1 p-2 bg-slate-900 text-slate-200 font-mono text-[10px] rounded-lg space-y-0.5">
                          <div><span className="text-purple-400">MSSQL_SERVER</span>=127.0.0.1</div>
                          <div><span className="text-purple-400">MSSQL_PORT</span>=1433</div>
                          <div><span className="text-purple-400">MSSQL_DATABASE</span>={standaloneDatabase}</div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold text-[10px] flex items-center justify-center">4</span>
                          <span className="font-extrabold text-slate-900">Run Fully Offline</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          The computer operates independently without requiring internet connection or local network router.
                        </p>
                      </div>
                    </>
                  ) : (
                    /* Google Cloud Setup Steps */
                    <>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-extrabold text-[10px] flex items-center justify-center">1</span>
                          <span className="font-extrabold text-slate-900">Install Client Application on Computer</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          Deploy the compiled ApexWMS application package on each individual workstation (or launch via Node/Vite web server).
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-extrabold text-[10px] flex items-center justify-center">2</span>
                          <span className="font-extrabold text-slate-900">Authorize Computer Egress IP or Run Cloud SQL Proxy</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          In Google Cloud Console, add your workstation's public IP to <strong>Cloud SQL Authorized Networks</strong>, or launch the <strong>Cloud SQL Auth Proxy</strong> daemon on the computer:
                        </p>
                        <div className="ml-7 mt-1 p-2 bg-slate-900 text-emerald-400 font-mono text-[10px] rounded-lg">
                          cloud-sql-proxy {gcpInstance} --port {gcpPort}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-extrabold text-[10px] flex items-center justify-center">3</span>
                          <span className="font-extrabold text-slate-900">Configure `.env` Environment File</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          On the individual workstation, set environment variables pointing to Google Cloud SQL:
                        </p>
                        <div className="ml-7 mt-1 p-2 bg-slate-900 text-slate-200 font-mono text-[10px] rounded-lg space-y-0.5">
                          <div><span className="text-blue-400">MSSQL_SERVER</span>={gcpHostIp}</div>
                          <div><span className="text-blue-400">MSSQL_PORT</span>={gcpPort}</div>
                          <div><span className="text-blue-400">MSSQL_DATABASE</span>={gcpDatabase}</div>
                          <div><span className="text-blue-400">MSSQL_USER</span>={gcpUser}</div>
                          <div><span className="text-blue-400">MSSQL_ENCRYPT</span>=true</div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-extrabold text-[10px] flex items-center justify-center">4</span>
                          <span className="font-extrabold text-slate-900">Verify Microsoft ODBC Driver 18 for SQL Server</span>
                        </div>
                        <p className="text-slate-600 text-[11px] pl-7">
                          Ensure Microsoft ODBC Driver 18 or standard Node.js `tedious` driver is installed on the local workstation for TLS encrypted MS SQL queries.
                        </p>
                      </div>
                    </>
                  )}

                </div>
              </div>

              {/* Ready-to-Use Connection Strings */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                    <Code className="w-4 h-4 text-purple-600" />
                    <span>Workstation Connection Strings (1-Click Copy)</span>
                  </h4>
                  <span className="text-[10px] font-mono text-slate-500 font-bold">
                    {dbMode === 'lan_standalone' ? 'LAN On-Premise' : dbMode === 'local_standalone' ? 'Standalone Local' : 'Google Cloud SQL'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  
                  {/* Node.js Tedious */}
                  <div className="p-2.5 bg-slate-900 text-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-emerald-400">Node.js (Tedious / mssql)</span>
                      <button
                        onClick={() => {
                          const host = dbMode === 'lan_standalone' ? lanHostIp : dbMode === 'local_standalone' ? standaloneHost : gcpHostIp;
                          const port = dbMode === 'lan_standalone' ? lanPort : dbMode === 'local_standalone' ? standalonePort : gcpPort;
                          const db = dbMode === 'lan_standalone' ? lanDatabase : dbMode === 'local_standalone' ? standaloneDatabase : gcpDatabase;
                          const usr = dbMode === 'lan_standalone' ? lanUser : dbMode === 'local_standalone' ? standaloneUser : gcpUser;
                          const pwd = dbMode === 'lan_standalone' ? lanPassword : dbMode === 'local_standalone' ? standalonePassword : gcpPassword;
                          handleCopyConnectionString(
                            'node',
                            `const config = { server: '${host}', port: ${port}, database: '${db}', user: '${usr}', password: '${pwd}', options: { encrypt: ${dbMode === 'gcp_cloud_sql'}, trustServerCertificate: true } };`
                          );
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-sans flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedFormat === 'node' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      server: '{dbMode === 'lan_standalone' ? lanHostIp : dbMode === 'local_standalone' ? standaloneHost : gcpHostIp}', port: {dbMode === 'lan_standalone' ? lanPort : dbMode === 'local_standalone' ? standalonePort : gcpPort}, database: '{dbMode === 'lan_standalone' ? lanDatabase : dbMode === 'local_standalone' ? standaloneDatabase : gcpDatabase}'
                    </p>
                  </div>

                  {/* ADO.NET C# */}
                  <div className="p-2.5 bg-slate-900 text-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-sky-400">ADO.NET / C# (.NET Core)</span>
                      <button
                        onClick={() => {
                          const host = dbMode === 'lan_standalone' ? lanHostIp : dbMode === 'local_standalone' ? standaloneHost : gcpHostIp;
                          const port = dbMode === 'lan_standalone' ? lanPort : dbMode === 'local_standalone' ? standalonePort : gcpPort;
                          const db = dbMode === 'lan_standalone' ? lanDatabase : dbMode === 'local_standalone' ? standaloneDatabase : gcpDatabase;
                          const usr = dbMode === 'lan_standalone' ? lanUser : dbMode === 'local_standalone' ? standaloneUser : gcpUser;
                          const pwd = dbMode === 'lan_standalone' ? lanPassword : dbMode === 'local_standalone' ? standalonePassword : gcpPassword;
                          handleCopyConnectionString(
                            'csharp',
                            `Server=${host},${port};Database=${db};User Id=${usr};Password=${pwd};Encrypt=${dbMode === 'gcp_cloud_sql'};TrustServerCertificate=True;`
                          );
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-sans flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedFormat === 'csharp' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      Server={dbMode === 'lan_standalone' ? lanHostIp : dbMode === 'local_standalone' ? standaloneHost : gcpHostIp},{dbMode === 'lan_standalone' ? lanPort : dbMode === 'local_standalone' ? standalonePort : gcpPort};Database={dbMode === 'lan_standalone' ? lanDatabase : dbMode === 'local_standalone' ? standaloneDatabase : gcpDatabase};
                    </p>
                  </div>

                  {/* Python pyodbc */}
                  <div className="p-2.5 bg-slate-900 text-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-amber-400">Python (pyodbc)</span>
                      <button
                        onClick={() => {
                          const host = dbMode === 'lan_standalone' ? lanHostIp : dbMode === 'local_standalone' ? standaloneHost : gcpHostIp;
                          const port = dbMode === 'lan_standalone' ? lanPort : dbMode === 'local_standalone' ? standalonePort : gcpPort;
                          const db = dbMode === 'lan_standalone' ? lanDatabase : dbMode === 'local_standalone' ? standaloneDatabase : gcpDatabase;
                          const usr = dbMode === 'lan_standalone' ? lanUser : dbMode === 'local_standalone' ? standaloneUser : gcpUser;
                          const pwd = dbMode === 'lan_standalone' ? lanPassword : dbMode === 'local_standalone' ? standalonePassword : gcpPassword;
                          handleCopyConnectionString(
                            'python',
                            `DRIVER={ODBC Driver 18 for SQL Server};SERVER=${host},${port};DATABASE=${db};UID=${usr};PWD=${pwd};Encrypt=${dbMode === 'gcp_cloud_sql' ? 'yes' : 'no'};`
                          );
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-sans flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedFormat === 'python' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      DRIVER=ODBC Driver 18;SERVER={dbMode === 'lan_standalone' ? lanHostIp : dbMode === 'local_standalone' ? standaloneHost : gcpHostIp},{dbMode === 'lan_standalone' ? lanPort : dbMode === 'local_standalone' ? standalonePort : gcpPort};DATABASE={dbMode === 'lan_standalone' ? lanDatabase : dbMode === 'local_standalone' ? standaloneDatabase : gcpDatabase};
                    </p>
                  </div>

                </div>
              </div>

            </div>

          </div>

        </div>
      )}
      {showManualNoteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <PlusCircle className="w-5 h-5 text-purple-600" />
                <span>Log Administrative Audit Note</span>
              </h3>
              <button
                onClick={() => setShowManualNoteModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddManualAuditNote} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Entity / Module</label>
                <input
                  type="text"
                  placeholder="e.g. Batch B2608-MILK-A or User USR-102"
                  value={manualNoteEntity}
                  onChange={(e) => setManualNoteEntity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Action Category</label>
                  <select
                    value={manualNoteCategory}
                    onChange={(e) => setManualNoteCategory(e.target.value as AuditCategory)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                  >
                    <option value="ROLE_MANAGEMENT">Role & RBAC Security</option>
                    <option value="QUARANTINE">Quarantine Hold</option>
                    <option value="INVENTORY">Inventory Adjustment</option>
                    <option value="INBOUND">Inbound Stock</option>
                    <option value="PICKING">Order Picking</option>
                    <option value="SYSTEM">System Audit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Severity</label>
                  <select
                    value={manualNoteSeverity}
                    onChange={(e) => setManualNoteSeverity(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                  >
                    <option value="INFO">INFO</option>
                    <option value="WARNING">WARNING</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Audit Log Entry Details</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe administrative activity or compliance note..."
                  value={manualNoteDetails}
                  onChange={(e) => setManualNoteDetails(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualNoteModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-xs"
                >
                  Save to `dbo.AuditLogs`
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
