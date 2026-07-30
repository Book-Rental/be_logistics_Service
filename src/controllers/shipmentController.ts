import { Request, Response } from "express";
import { StatusCode } from "../utils/StatusCodes";
import { successResponse, failResponse, errorResponse } from "../utils/response";

import { createShipmentService } from "../services/shipmentService";
import { Messages } from "../utils/constants";

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
