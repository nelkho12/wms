import React, { useState } from 'react';
import {
  Route,
  Navigation,
  CheckCircle2,
  Clock,
  TrendingDown,
  MapPin,
  Sparkles,
  Zap,
  ArrowRight,
  PackageCheck,
  AlertTriangle,
  Play,
  Lock
} from 'lucide-react';
import { Batch, Location, PickOrder, PickRoute } from '../types/wms';
import { UserProfile, UserRole, WmsPermission, hasPermission } from '../types/roles';
import { calculateOptimizedPickRoute } from '../utils/routeOptimizer';
import { completeOrderPicking } from '../services/api';

interface RouteOptimizerViewProps {
  orders: PickOrder[];
  batches: Batch[];
  locations: Location[];
  currentUser: UserProfile;
  onRefresh: () => void;
  onOpenRoleModal?: () => void;
  customRolePermissions?: Record<UserRole, WmsPermission[]>;
}

export const RouteOptimizerView: React.FC<RouteOptimizerViewProps> = ({
  orders,
  batches,
  locations,
  currentUser,
  onRefresh,
  onOpenRoleModal,
  customRolePermissions
}) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(orders[0]?.id || '');
  const [activeRoute, setActiveRoute] = useState<PickRoute | null>(null);
  const [isPickingActive, setIsPickingActive] = useState(false);
  const [currentPickStep, setCurrentPickStep] = useState(1);
  const [completionSuccess, setCompletionSuccess] = useState(false);
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null);

  const canPickOrders = hasPermission(currentUser.role, 'orders:pick', customRolePermissions);
  const canManageOrders = hasPermission(currentUser.role, 'orders:manage', customRolePermissions);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || orders[0];

  const handleRunOptimization = () => {
    if (!canManageOrders && !canPickOrders) {
      setPermissionWarning(`Role Security Guard: Active role '${currentUser.role}' lacks order permission. Only Picker, Warehouse Manager, or Admin can optimize or execute pick walks.`);
      return;
    }
    setPermissionWarning(null);
    if (!selectedOrder) return;
    const route = calculateOptimizedPickRoute(selectedOrder, batches, locations);
    setActiveRoute(route);
    setIsPickingActive(false);
    setCurrentPickStep(1);
    setCompletionSuccess(false);
  };

  const handleStartPickWalk = () => {
    if (!canPickOrders) {
      setPermissionWarning(`Role Security Guard: Active role '${currentUser.role}' lacks 'orders:pick' permission. Only Picker, Warehouse Manager, or Admin can perform pick walks.`);
      return;
    }
    setPermissionWarning(null);
    setIsPickingActive(true);
    setCurrentPickStep(1);
  };

  const handleConfirmNextPickStep = () => {
    if (!activeRoute) return;
    if (currentPickStep < activeRoute.nodes.length) {
      setCurrentPickStep((prev) => prev + 1);
    } else {
      // Completed all steps!
      handleFinishOrderPick();
    }
  };

  const handleFinishOrderPick = async () => {
    if (!selectedOrder || !activeRoute) return;
    try {
      const pickedItemsPayload = activeRoute.nodes.map((node) => ({
        batchNo: node.batchNo,
        qty: node.pickQty
      }));

      await completeOrderPicking(selectedOrder.id, pickedItemsPayload);
      setCompletionSuccess(true);
      setIsPickingActive(false);
      onRefresh();
    } catch (err: any) {
      alert(`Completing order failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Permission Warning Banner if restricted */}
      {permissionWarning && (
        <div className="bg-rose-50 border border-rose-300 p-4 rounded-xl text-xs text-rose-900 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-2">
            <Lock className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>{permissionWarning}</span>
          </div>
          {onOpenRoleModal && (
            <button
              onClick={onOpenRoleModal}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs cursor-pointer ml-3 flex-shrink-0"
            >
              Switch Role
            </button>
          )}
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Route className="w-4 h-4" />
            <span>Automated TSP & FEFO Picking Walk Planner</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            Picking Route Optimization
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Calculates the shortest walking sequence across warehouse aisles while enforcing First-Expired, First-Out (FEFO) batch allocation.
          </p>
        </div>

        {/* Order Selector Controls */}
        <div className="flex items-center space-x-3 bg-slate-50 p-2.5 rounded-xl border border-slate-300">
          <select
            value={selectedOrderId}
            onChange={(e) => {
              setSelectedOrderId(e.target.value);
              setActiveRoute(null);
            }}
            className="bg-transparent text-sm font-bold text-slate-900 font-mono focus:outline-none pr-4"
          >
            {orders.map((ord) => (
              <option key={ord.id} value={ord.id} className="bg-white text-slate-900">
                {ord.id} - {ord.customerName.slice(0, 22)}... ({ord.priority})
              </option>
            ))}
          </select>

          <button
            onClick={handleRunOptimization}
            className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Optimize FEFO Route</span>
          </button>
        </div>
      </div>

      {completionSuccess && (
        <div className="p-4 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2 font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Pick Order {selectedOrder?.id} completed successfully! Stock quantities deducted and stock movement logged.</span>
          </div>
          <button
            onClick={() => setCompletionSuccess(false)}
            className="text-xs text-emerald-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: 2D Warehouse Floor Map + Step Guidance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (7 cols): Interactive 2D Warehouse Floor Map Canvas */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                <Navigation className="w-4 h-4 text-blue-600" />
                <span>Warehouse Floor Plan & Active Route Polyline</span>
              </h3>
              <p className="text-xs text-slate-500">Aisles A, B, C, D layout grid (1 grid unit = 3.2m walk)</p>
            </div>
            {activeRoute && (
              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 border border-blue-300 rounded-md text-xs font-mono font-bold">
                Route Active: {activeRoute.nodes.length} Stops
              </span>
            )}
          </div>

          {/* Warehouse Visual Canvas representation */}
          <div className="relative w-full aspect-[4/3] bg-slate-50 border border-slate-300 rounded-xl p-4 overflow-hidden flex flex-col justify-between">
            
            {/* SVG Path Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 16 16" preserveAspectRatio="none">
              {activeRoute && activeRoute.pathCoordinates.length > 1 && (
                <>
                  {/* Outer Polyline Glow */}
                  <polyline
                    points={activeRoute.pathCoordinates.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="0.3"
                    strokeDasharray="0.4 0.2"
                    className="opacity-80 animate-pulse"
                  />
                  {/* Solid Polyline */}
                  <polyline
                    points={activeRoute.pathCoordinates.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth="0.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
            </svg>

            {/* Warehouse Aisles Rendering */}
            <div className="relative z-0 h-full w-full grid grid-cols-4 gap-3">
              {['A', 'B', 'C', 'D'].map((aisle) => {
                const aisleLocations = locations.filter((l) => l.aisle === aisle);
                return (
                  <div key={aisle} className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                      <span className="font-mono font-bold text-xs text-slate-800">Aisle {aisle}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {aisle === 'A' ? 'Cold' : aisle === 'B' ? 'High-Vel' : aisle === 'C' ? 'Dry' : 'Pharma'}
                      </span>
                    </div>

                    <div className="space-y-1.5 my-auto">
                      {aisleLocations.map((loc) => {
                        const isPickTarget = activeRoute?.nodes.some((n) => n.locationId === loc.id);
                        const isCurrentActiveStep =
                          activeRoute && activeRoute.nodes[currentPickStep - 1]?.locationId === loc.id;

                        return (
                          <div
                            key={loc.id}
                            className={`p-1.5 rounded text-[11px] font-mono flex items-center justify-between transition-all ${
                              isCurrentActiveStep
                                ? 'bg-amber-400 text-slate-950 font-black shadow-md scale-105 border border-amber-500'
                                : isPickTarget
                                ? 'bg-blue-600 text-white font-bold border border-blue-700'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <span>{loc.id}</span>
                            {isPickTarget && <span className="text-[9px] bg-slate-900/10 px-1 rounded font-bold">PICK</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dispatch Staging Dock Footer */}
            <div className="relative z-20 mt-3 p-2 bg-gradient-to-r from-emerald-100 to-slate-100 border border-emerald-300 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Outbound Staging & Dispatch Dock [Grid: 0, 14]</span>
              </div>
              <span className="text-[11px] text-slate-600">Start / End Location</span>
            </div>

          </div>
        </div>

        {/* Right Column (5 cols): Metrics & Guided Pick Step Sequence */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Metrics Card */}
          {activeRoute ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-500 uppercase">Route Optimization Metrics</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded border border-emerald-300">
                  FEFO Verified
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-200 text-center">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Walk Distance</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{activeRoute.totalDistanceMeters}m</p>
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Est. Duration</p>
                  <p className="text-lg font-bold text-blue-700 mt-0.5">{activeRoute.estimatedTimeMinutes} min</p>
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Distance Saved</p>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5 flex items-center justify-center">
                    <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
                    {activeRoute.savedDistancePercent}%
                  </p>
                </div>
              </div>

              {!isPickingActive ? (
                <button
                  onClick={handleStartPickWalk}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Guided Mobile Pick Walk</span>
                </button>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between">
                  <div className="text-xs text-amber-900">
                    Active Pick Step: <span className="font-bold">{currentPickStep} of {activeRoute.nodes.length}</span>
                  </div>
                  <button
                    onClick={handleConfirmNextPickStep}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded shadow-xs cursor-pointer"
                  >
                    Confirm Stop #{currentPickStep}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3 shadow-xs">
              <Sparkles className="w-10 h-10 text-blue-600 mx-auto animate-bounce" />
              <h4 className="font-bold text-slate-900 text-base">No Pick Route Generated</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Select a pending pick order above and click <strong>"Optimize FEFO Route"</strong> to generate the walk sequence.
              </p>
            </div>
          )}

          {/* Sequence Step List */}
          {activeRoute && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
              <h4 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                <span>Pick Walk Sequence ({activeRoute.nodes.length} Locations)</span>
                <span className="text-xs text-slate-500 font-mono font-normal">Sorted by FEFO</span>
              </h4>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {activeRoute.nodes.map((node) => {
                  const isCurrent = isPickingActive && currentPickStep === node.step;
                  const isDone = isPickingActive && currentPickStep > node.step;

                  return (
                    <div
                      key={node.step}
                      className={`p-3 rounded-lg border text-xs transition-all ${
                        isCurrent
                          ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-xs'
                          : isDone
                          ? 'bg-slate-50 border-slate-200 text-slate-400'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono font-bold mb-1">
                        <span className="flex items-center space-x-1.5">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                            isDone ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {node.step}
                          </span>
                          <span className="text-blue-700">📍 {node.locationId}</span>
                        </span>
                        <span className="text-emerald-700 font-bold">{node.pickQty} units</span>
                      </div>

                      <div className="font-bold text-slate-900 pl-6">{node.itemName}</div>
                      <div className="text-[11px] font-mono text-slate-600 pl-6 mt-0.5">
                        Batch: <span className="text-blue-700 font-semibold">{node.batchNo}</span> | BBD: {node.bestBeforeDate}
                      </div>

                      {node.fefoReason && (
                        <div className="pl-6 mt-1 text-[10px] font-semibold text-amber-800 flex items-center">
                          <Zap className="w-3 h-3 mr-1 text-amber-600" />
                          {node.fefoReason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
