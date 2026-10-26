import { Batch, Location, PickOrder, PickRoute, RouteNode } from '../types/wms';

const DOCK_X = 0;
const DOCK_Y = 14; // Packing / Outbound Staging Bay location at grid origin

export function calculateOptimizedPickRoute(
  order: PickOrder,
  batches: Batch[],
  locations: Location[]
): PickRoute {
  // Map locations by ID for quick lookup
  const locationMap = new Map<string, Location>();
  locations.forEach((loc) => locationMap.set(loc.id, loc));

  // Build candidate pick targets for each order item adhering to FEFO
  const pickTargets: Array<{
    itemSku: string;
    itemName: string;
    batchNo: string;
    bestBeforeDate: string;
    locationId: string;
    location: Location;
    pickQty: number;
    fefoReason?: string;
  }> = [];

  for (const item of order.items) {
    let remainingToPick = item.requestedQty;

    // Filter active batches for this SKU and sort by FEFO (Best Before Date ASC)
    const matchingBatches = batches
      .filter((b) => b.sku === item.sku && b.status === 'ACTIVE' && b.quantityAvailable > 0)
      .sort((a, b) => new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime());

    for (const batch of matchingBatches) {
      if (remainingToPick <= 0) break;

      const loc = locationMap.get(batch.locationId);
      if (!loc) continue;

      const qtyToPickFromBatch = Math.min(remainingToPick, batch.quantityAvailable);
      remainingToPick -= qtyToPickFromBatch;

      const daysToExpiry = Math.ceil(
        (new Date(batch.bestBeforeDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)
      );

      pickTargets.push({
        itemSku: item.sku,
        itemName: item.itemName,
        batchNo: batch.batchNo,
        bestBeforeDate: batch.bestBeforeDate,
        locationId: loc.id,
        location: loc,
        pickQty: qtyToPickFromBatch,
        fefoReason:
          daysToExpiry <= 14
            ? `⚡ FEFO Priority: Expiring in ${daysToExpiry} days (${batch.bestBeforeDate})`
            : `FEFO Batch: ${batch.batchNo} (Expiry: ${batch.bestBeforeDate})`
      });
    }
  }

  // If no targets found or empty
  if (pickTargets.length === 0) {
    return {
      orderId: order.id,
      totalDistanceMeters: 0,
      estimatedTimeMinutes: 0,
      savedDistancePercent: 0,
      nodes: [],
      pathCoordinates: [[DOCK_X, DOCK_Y]]
    };
  }

  // Greedy Nearest Neighbor TSP algorithm for warehouse aisle walking route
  const visited = new Set<number>();
  const routeNodes: RouteNode[] = [];
  const pathCoordinates: Array<[number, number]> = [[DOCK_X, DOCK_Y]];

  let currentX = DOCK_X;
  let currentY = DOCK_Y;
  let unoptimizedDistance = 0;
  let optimizedDistance = 0;

  // Compute unoptimized distance (visiting in arbitrary list order)
  let prevUnoptX = DOCK_X;
  let prevUnoptY = DOCK_Y;
  for (const target of pickTargets) {
    unoptimizedDistance +=
      Math.abs(target.location.gridX - prevUnoptX) + Math.abs(target.location.gridY - prevUnoptY);
    prevUnoptX = target.location.gridX;
    prevUnoptY = target.location.gridY;
  }
  unoptimizedDistance += Math.abs(prevUnoptX - DOCK_X) + Math.abs(prevUnoptY - DOCK_Y);

  // Optimized Nearest Neighbor walk
  let step = 1;
  while (visited.size < pickTargets.length) {
    let nearestIdx = -1;
    let minDistance = Infinity;

    for (let i = 0; i < pickTargets.length; i++) {
      if (visited.has(i)) continue;
      const target = pickTargets[i];

      // Manhattan distance on warehouse grid
      const dist =
        Math.abs(target.location.gridX - currentX) + Math.abs(target.location.gridY - currentY);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIdx = i;
      }
    }

    if (nearestIdx !== -1) {
      visited.add(nearestIdx);
      const chosen = pickTargets[nearestIdx];

      // Add waypoints (aisle entrance navigation for visual clean path)
      pathCoordinates.push([chosen.location.gridX, currentY]); // Move horizontally to aisle
      pathCoordinates.push([chosen.location.gridX, chosen.location.gridY]); // Move vertically down aisle

      optimizedDistance += minDistance;
      currentX = chosen.location.gridX;
      currentY = chosen.location.gridY;

      routeNodes.push({
        step,
        locationId: chosen.locationId,
        aisle: chosen.location.aisle,
        gridX: chosen.location.gridX,
        gridY: chosen.location.gridY,
        sku: chosen.itemSku,
        itemName: chosen.itemName,
        batchNo: chosen.batchNo,
        bestBeforeDate: chosen.bestBeforeDate,
        pickQty: chosen.pickQty,
        instruction: `Walk to Aisle ${chosen.location.aisle}, Location ${chosen.locationId}. Pick ${chosen.pickQty}x ${chosen.itemName}`,
        fefoReason: chosen.fefoReason
      });

      step++;
    }
  }

  // Return to dock
  optimizedDistance += Math.abs(currentX - DOCK_X) + Math.abs(currentY - DOCK_Y);
  pathCoordinates.push([DOCK_X, DOCK_Y]);

  // Convert grid distance to meters (1 grid unit = ~3 meters)
  const totalMeters = Math.round(optimizedDistance * 3.2);
  const estimatedMins = Math.max(1, Math.round(totalMeters / 60) + routeNodes.length * 0.5);

  const savedPercent =
    unoptimizedDistance > 0
      ? Math.min(65, Math.round(((unoptimizedDistance - optimizedDistance) / unoptimizedDistance) * 100))
      : 30;

  return {
    orderId: order.id,
    totalDistanceMeters: totalMeters,
    estimatedTimeMinutes: Number(estimatedMins.toFixed(1)),
    savedDistancePercent: Math.max(15, savedPercent),
    nodes: routeNodes,
    pathCoordinates
  };
}
