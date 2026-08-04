import { Request, Response } from "express";
import { StatusCode } from "../utils/StatusCodes";
import { successResponse, failResponse, errorResponse } from "../utils/response";

import { createShipmentService, getShipmentByAgentIdService, getShipmentByIdService, getShipmentByOrderItemIdService, readyForPickupService, updateShipmentStatusService } from "../services/shipmentService";
import { Messages } from "../utils/constants";

export const createShipment = async (req: Request, res: Response) => {
    try {
        console.log("dataa", req.body);
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
        const { orderItemId } = req.params as unknown as Record<string, string>;

        if (!orderItemId) {
            return failResponse(res, "Order item ID is required.", StatusCode.Bad_Request);
        }

        const shipment = await readyForPickupService(orderItemId);

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

        successResponse(res, shipment, Messages.SHIPMENT_FETCHED_SUCCESSFULLY, StatusCode.OK)


    } catch (error: any) {
        return failResponse(
            res,
            error.message || "Something went wrong.",
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
}


export const getShipmentByAgentId = async (req: Request, res: Response) => {
    try {
        const agentId = req.params.agentId as string;

        if (!agentId) {
            return failResponse(res, Messages.AGENTID_REQUIRED, StatusCode.Bad_Request);
        }
        const shipment = await getShipmentByAgentIdService(agentId);

        successResponse(res, shipment, Messages.SHIPMENT_FETCHED_SUCCESSFULLY, StatusCode.OK)

    } catch (error: any) {
        return failResponse(
            res,
            error.message || "Something went wrong.",
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
}

export const updateShipmentStatus = async (
    req: Request,
    res: Response
) => {
    try {
        const shipment = await updateShipmentStatusService({
            shipmentId: req.params.shipmentId,
            ...req.body,
        });

        return successResponse(
            res,
            shipment,
            "Shipment updated successfully.",
            StatusCode.OK,
        );
    } catch (error: any) {
        return failResponse(
            res,

            error.message,
            error.statusCode || StatusCode.Internal_Server_Error,
        );
    }
};

export const getShipmentByOrderItemId = async (
    req: Request,
    res: Response
) => {
    try {
        const { orderItemId } = req.params as { orderItemId: string };

        if (!orderItemId) {
            return failResponse(
                res,
                "Order Item Id is required.",
                StatusCode.Bad_Request
            );
        }

        const shipment =
            await getShipmentByOrderItemIdService(orderItemId);

        return successResponse(
            res,
            shipment,
            "Shipment fetched successfully.",
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