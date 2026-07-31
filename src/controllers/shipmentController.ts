import { Request, Response } from "express";
import { StatusCode } from "../utils/StatusCodes";
import { successResponse, failResponse, errorResponse } from "../utils/response";

import { createShipmentService, getShipmentByIdService, readyForPickupService } from "../services/shipmentService";
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