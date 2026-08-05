import { Request, Response } from "express";
import {
    createHubService,
    getAllHubsService,
    getHubByIdService,
    getShipmentsByHubService,
} from "../services/hubService";
import { failResponse, successResponse } from "../utils/response";
import { Messages } from "../utils/constants";
import { StatusCode } from "../utils/StatusCodes";

// POST /hubs
export const createHub = async (req: Request, res: Response) => {
    try {
        const hub = await createHubService(req.body);

        return res.status(201).json({
            success: true,
            message: "Hub and hub manager login created successfully",
            data: hub,
        });
    } catch (error: any) {
        const message = error?.message || "Failed to create hub";

        // Known validation-style errors from the service -> 409/400,
        // anything unexpected -> 500
        const conflictErrors = ["Phone number already exists", "Email already exists"];
        const status = conflictErrors.includes(message) ? 409 : 400;

        return res.status(status).json({
            success: false,
            message,
        });
    }
};

// GET /hubs
export const getAllHubs = async (_req: Request, res: Response) => {
    try {
        const hubs = await getAllHubsService();

        return res.status(200).json({
            success: true,
            data: hubs,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || "Failed to fetch hubs",
        });
    }
};

export const getHubByHubId = async (req: Request, res: Response) => {
    try {
        const hubId = req.params.hubId as string;

        if (!hubId) {
            return failResponse(res, "hubId parameters are required", StatusCode.Bad_Request);
        }
        const hub = await getHubByIdService(hubId);

        successResponse(res, hub, Messages.HUB_FETECHED_SUCCESSFULLY, StatusCode.OK);
    } catch (error: any) {
        failResponse(res, error.message || Messages.Internal_Server_Error, StatusCode.Bad_Request);
    }
};

export const getShipmentsByHub = async (req: Request, res: Response) => {
    try {
        const hubId = req.params.hubId as string;

        const shipments = await getShipmentsByHubService(hubId, req.query);

        return successResponse(res, shipments, "Shipments fetched successfully.", StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,
            error.message,
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
};
