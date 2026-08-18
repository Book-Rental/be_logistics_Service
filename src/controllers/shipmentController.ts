import { Request, Response } from "express";
import { StatusCode } from "../utils/StatusCodes";
import { successResponse, failResponse, errorResponse } from "../utils/response";

import {
    bulkUpdateShipmentService,
    createShipmentService,
    deleteShipmentService,
    getShipmentByAgentIdService,
    getShipmentByIdService,
    getShipmentByOrderItemIdService,
    getShipmentStatuseByAwbNumberService,
    readyForPickupService,
    updateShipmentStatusService,
} from "../services/shipmentService";
import { Messages } from "../utils/constants";
import mongoose from "mongoose";
import { ShipmentStatus } from "../models/shipment";

export const createShipment = async (req: Request, res: Response) => {
    try {
        const shipment = await createShipmentService(req.body);

        return successResponse(
            res,
            shipment,
            Messages.SHIPMENT_CREATED_SUCCESSFULLY,
            StatusCode.OK
        );
    } catch (error: any) {
        if (error instanceof Error) {
            return failResponse(
                res,

                error.message,
                StatusCode.Bad_Request
            );
        }

        return errorResponse(
            res,

            Messages.Internal_Server_Error,
            StatusCode.Internal_Server_Error
        );
    }
};

export const readyForPickup = async (req: Request, res: Response) => {
    try {
        const { shipmentID } = req.params as unknown as Record<string, string>;

        if (!shipmentID) {
            return failResponse(res, "shipmentID is required.", StatusCode.Bad_Request);
        }

        const shipment = await readyForPickupService(shipmentID);

        return successResponse(
            res,
            shipment,
            "Shipment marked as ready for pickup successfully.",

            StatusCode.OK
        );
    } catch (error: any) {
        return failResponse(
            res,

            error.message || "Something went wrong.",
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};

export const getShipmentById = async (req: Request, res: Response) => {
    try {
        const shipmentId = req.params.shipmentID as string;
        if (!shipmentId) {
            return failResponse(res, "shipmentId is required.", StatusCode.Bad_Request);
        }
        const shipment = await getShipmentByIdService(shipmentId);

        successResponse(res, shipment, Messages.SHIPMENT_FETCHED_SUCCESSFULLY, StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,
            error.message || "Something went wrong.",
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};

export const getShipmentByAgentId = async (req: Request, res: Response) => {
    try {
        const agentId = req.params.agentId as string;

        if (!agentId) {
            return failResponse(res, Messages.AGENTID_REQUIRED, StatusCode.Bad_Request);
        }
        const shipment = await getShipmentByAgentIdService(agentId, req.query);

        successResponse(res, shipment, Messages.SHIPMENT_FETCHED_SUCCESSFULLY, StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,
            error.message || "Something went wrong.",
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};

export const updateShipmentStatus = async (req: Request, res: Response) => {
    try {
        const shipment = await updateShipmentStatusService({
            shipmentId: req.params.shipmentId,
            ...req.body,
        });

        return successResponse(res, shipment, "Shipment updated successfully.", StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,

            error.message,
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};

export const getShipmentByOrderItemId = async (req: Request, res: Response) => {
    try {
        const { orderItemId } = req.params as { orderItemId: string };

        if (!orderItemId) {
            return failResponse(res, "Order Item Id is required.", StatusCode.Bad_Request);
        }

        const shipment = await getShipmentByOrderItemIdService(orderItemId);

        return successResponse(res, shipment, "Shipment fetched successfully.", StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,
            error.message,
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};

export const assignAgentToShipments = async (req: Request, res: Response) => {
    try {
        const { shipmentIds, agentId, updatedBy, status, remarks } = req.body;

        // --------------------------------------------
        // shipmentIds validation
        // --------------------------------------------
        if (!shipmentIds || !Array.isArray(shipmentIds) || shipmentIds.length === 0) {
            return failResponse(
                res,
                "shipmentIds must be a non-empty array.",
                StatusCode.Bad_Request
            );
        }

        // --------------------------------------------
        // Validate shipment IDs
        // --------------------------------------------
        const invalidShipmentIds = shipmentIds.filter(
            (id: string) => !mongoose.Types.ObjectId.isValid(id)
        );

        if (invalidShipmentIds.length > 0) {
            return failResponse(
                res,
                `Invalid shipment ID(s): ${invalidShipmentIds.join(", ")}`,
                StatusCode.Bad_Request
            );
        }

        // --------------------------------------------
        // Status validation
        // --------------------------------------------
        if (!status) {
            return failResponse(res, "status is required.", StatusCode.Bad_Request);
        }

        if (!Object.values(ShipmentStatus).includes(status as ShipmentStatus)) {
            return failResponse(res, `Invalid shipment status: ${status}`, StatusCode.Bad_Request);
        }

        // --------------------------------------------
        // Agent validation
        // --------------------------------------------
        const requiresAgent =
            status === ShipmentStatus.DELIVERY_AGENT_ASSIGNED ||
            status === ShipmentStatus.PICKUP_ASSIGNED;

        if (requiresAgent && !agentId) {
            return failResponse(
                res,
                `agentId is required for status "${status}".`,
                StatusCode.Bad_Request
            );
        }

        if (agentId && !mongoose.Types.ObjectId.isValid(agentId)) {
            return failResponse(res, "Invalid agentId.", StatusCode.Bad_Request);
        }

        // --------------------------------------------
        // updatedBy validation
        // --------------------------------------------
        if (!updatedBy) {
            return failResponse(res, "updatedBy is required.", StatusCode.Bad_Request);
        }

        if (!mongoose.Types.ObjectId.isValid(updatedBy)) {
            return failResponse(res, "Invalid updatedBy.", StatusCode.Bad_Request);
        }

        // --------------------------------------------
        // Call service
        // --------------------------------------------
        const result = await bulkUpdateShipmentService({
            shipmentIds,
            agentId,
            status: status as ShipmentStatus,
            remarks,
            updatedBy,
        });

        return successResponse(res, result, "Shipments updated successfully.", StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,
            error.message,
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};

export const deleteShipment = async (req: Request, res: Response) => {
    try {
        const shipmentId = req.params.shipmentId as string;

        if (!shipmentId) {
            return failResponse(res, "shipmentId is required.", StatusCode.Bad_Request);
        }

        // Call the service to delete the shipment
        const result = await deleteShipmentService(shipmentId);

        return successResponse(res, result, "Shipment deleted successfully.", StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,
            error.message,
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};

export const getShipmentStatusByAWBNumber = async (req: Request, res: Response) => {
    try {
        const { awbNumber } = req.params as { awbNumber: string };

        if (!awbNumber) {
            return failResponse(res, "AWB Number is required.", StatusCode.Bad_Request);
        }

        const shipment = await getShipmentStatuseByAwbNumberService(awbNumber);

        if (!shipment) {
            return failResponse(res, "Shipment not found.", StatusCode.Not_Found);
        }

        return successResponse(
            res,
            shipment,
            "Shipment status fetched successfully.",
            StatusCode.OK
        );
    } catch (error: any) {
        return failResponse(
            res,
            error.message,
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};
