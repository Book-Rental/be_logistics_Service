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

export const SHIPMENT_STATUS_TRANSITIONS: Record<
    ShipmentStatus,
    ShipmentStatus[]
> = {
    [ShipmentStatus.CREATED]: [
        ShipmentStatus.READY_FOR_PICKUP,
        ShipmentStatus.CANCELLED,
    ],

    [ShipmentStatus.READY_FOR_PICKUP]: [
        ShipmentStatus.PICKUP_ASSIGNED,
        ShipmentStatus.CANCELLED,
    ],

    [ShipmentStatus.PICKUP_ASSIGNED]: [
        ShipmentStatus.OUT_FOR_PICKUP,
        ShipmentStatus.CANCELLED,
    ],

    [ShipmentStatus.OUT_FOR_PICKUP]: [
        ShipmentStatus.PICKUP_COMPLETED,
        ShipmentStatus.CANCELLED,
    ],

    [ShipmentStatus.PICKUP_COMPLETED]: [
        ShipmentStatus.ARRIVED_AT_ORIGIN_HUB,
    ],

    [ShipmentStatus.ARRIVED_AT_ORIGIN_HUB]: [
        ShipmentStatus.SORTING_COMPLETED,
    ],

    [ShipmentStatus.SORTING_COMPLETED]: [
        ShipmentStatus.IN_TRANSIT,
    ],

    [ShipmentStatus.IN_TRANSIT]: [
        ShipmentStatus.ARRIVED_AT_DESTINATION_HUB,
    ],

    [ShipmentStatus.ARRIVED_AT_DESTINATION_HUB]: [
        ShipmentStatus.DELIVERY_AGENT_ASSIGNED,
    ],

    [ShipmentStatus.DELIVERY_AGENT_ASSIGNED]: [
        ShipmentStatus.OUT_FOR_DELIVERY,
    ],

    [ShipmentStatus.OUT_FOR_DELIVERY]: [
        ShipmentStatus.DELIVERED,
        ShipmentStatus.DELIVERY_FAILED,
    ],

    [ShipmentStatus.DELIVERY_FAILED]: [
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.RETURN_INITIATED,
    ],

    [ShipmentStatus.RETURN_INITIATED]: [
        ShipmentStatus.RETURNED,
    ],

    [ShipmentStatus.RETURNED]: [],

    [ShipmentStatus.DELIVERED]: [],

    [ShipmentStatus.CANCELLED]: [],
};