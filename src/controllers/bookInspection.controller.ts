import { Request, Response } from "express";
import { createBookInspection } from "../services/bookInspection.service";
import {
    successResponse,
    failResponse,
    errorResponse,
} from "../utils/response";
import { StatusCode } from "../utils/StatusCodes";

export const createBookInspectionController = async (
    req: Request,
    res: Response
) => {
    try {
        const shipmentId = req.params.shipmentId as string;

        if (!shipmentId) {
            return failResponse(
                res,
                "Shipment ID is required",
                StatusCode.Bad_Request
            );
        }

        const files = (req.files || []) as Express.Multer.File[];

        const inspection = await createBookInspection(
            shipmentId,
            req.body,
            files
        );

        return successResponse(
            res,
            inspection,
            "Book inspection completed successfully",
            StatusCode.Created
        );
    } catch (error: any) {
        console.error(
            "Create book inspection error:",
            error
        );

        return errorResponse(
            res,
            error.message ||
                "Failed to create book inspection",
            error.statusCode ||
                StatusCode.Internal_Server_Error
        );
    }
};