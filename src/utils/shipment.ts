import { JourneyEventType, ShipmentStatus } from "../models/shipment";

export interface UpdateShipmentStatusPayload {
    shipmentId: string;
    status: ShipmentStatus;
    event: JourneyEventType;
    remarks?: string;
    agentId?: string;
    hubId?: string;
    updatedBy: string;
}
export const SHIPMENT_STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
    // Shipment created
    [ShipmentStatus.CREATED]: [ShipmentStatus.READY_FOR_PICKUP, ShipmentStatus.CANCELLED],

    // Ready for pickup
    [ShipmentStatus.READY_FOR_PICKUP]: [ShipmentStatus.PICKUP_ASSIGNED, ShipmentStatus.CANCELLED],

    // Pickup agent assigned
    [ShipmentStatus.PICKUP_ASSIGNED]: [ShipmentStatus.OUT_FOR_PICKUP, ShipmentStatus.CANCELLED],

    // Agent going to seller
    [ShipmentStatus.OUT_FOR_PICKUP]: [ShipmentStatus.PICKUP_COMPLETED, ShipmentStatus.CANCELLED],

    // Pickup completed
    // The shipment must first reach the origin hub.
    [ShipmentStatus.PICKUP_COMPLETED]: [ShipmentStatus.ARRIVED_AT_ORIGIN_HUB],

    // Origin hub reached
    // If originHubId === destinationHubId,
    // the service automatically changes the current status
    // to ARRIVED_AT_DESTINATION_HUB while keeping both
    // journey events.
    [ShipmentStatus.ARRIVED_AT_ORIGIN_HUB]: [ShipmentStatus.ARRIVED_AT_DESTINATION_HUB],

    // Destination hub reached
    // Now assign the final-mile delivery agent.
    [ShipmentStatus.ARRIVED_AT_DESTINATION_HUB]: [ShipmentStatus.DELIVERY_AGENT_ASSIGNED],

    // Delivery agent assigned
    [ShipmentStatus.DELIVERY_AGENT_ASSIGNED]: [ShipmentStatus.OUT_FOR_DELIVERY],

    // Shipment out for delivery
    [ShipmentStatus.OUT_FOR_DELIVERY]: [ShipmentStatus.DELIVERED, ShipmentStatus.DELIVERY_FAILED],

    // Delivery failed
    [ShipmentStatus.DELIVERY_FAILED]: [
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.RETURN_INITIATED,
    ],

    // Return initiated
    [ShipmentStatus.RETURN_INITIATED]: [ShipmentStatus.RETURNED],

    // Terminal states
    [ShipmentStatus.RETURNED]: [],

    [ShipmentStatus.DELIVERED]: [],

    [ShipmentStatus.CANCELLED]: [],

    // Reserved for multi-hub shipment flow
    [ShipmentStatus.SORTING_COMPLETED]: [],

    [ShipmentStatus.IN_TRANSIT]: [],
};

import { randomInt } from "crypto";

export const generateProductionAWB = (): string => {
    // 1. Get current date structure: YYMMDD (e.g., 260805)
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");

    // 2. Generate a secure, 6-digit random numeric counter (100000 to 999999)
    const secureRandomSegment = randomInt(100000, 1000000);

    // Output format: AWB-260805-472918 (16 characters total)
    return `AWB${dateStr}${secureRandomSegment}`;
};
