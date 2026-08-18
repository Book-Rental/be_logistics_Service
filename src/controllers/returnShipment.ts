import { createReturnShipmentService } from "../services/returnShipmentService";
import { createShipmentService } from "../services/shipmentService";
import { Messages } from "../utils/constants";
import { errorResponse, failResponse, successResponse } from "../utils/response";
import { StatusCode } from "../utils/StatusCodes";
import { Request, Response } from "express";

export const createReturnShipment = async (req: Request, res: Response) => {
    try {
        const shipment = await createReturnShipmentService(req.body);
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
