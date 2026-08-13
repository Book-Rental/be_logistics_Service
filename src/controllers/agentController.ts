import {
    createAgentService,
    getAgentByHubIdService,
    getAgentByIdServcie,
    getAllAgentService,
    updateAgentService,
    deleteAgentService,
    getAgentShipmentsService,
} from "../services/agentService";
import { Messages } from "../utils/constants";
import { failResponse, successResponse } from "../utils/response";
import { StatusCode } from "../utils/StatusCodes";
import { Request, Response } from "express";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

// POST /agents
export const createAgent = async (req: Request, res: Response) => {
    try {
        const file = req.file;

        let photo: string | undefined;

        if (file) {
            photo = await uploadToCloudinary(
                file.buffer,
                "book-rental/agents",
                `agent-${Date.now()}`
            );
        }

        const agent = await createAgentService({
            ...req.body,
            photo,
            isActive: req.body.isActive !== undefined ? req.body.isActive === "true" : true,
        });

        return res.status(201).json({
            success: true,
            message: "Agent and agent login created successfully",
            data: agent,
        });
    } catch (error: any) {
        const message = error?.message || "Failed to create agent";

        const conflictErrors = [
            "Phone number already exists",
            "Email already exists",
            "Hub not found",
        ];

        const status =
            message === "Hub not found" ? 404 : conflictErrors.includes(message) ? 409 : 400;

        return res.status(status).json({
            success: false,
            message,
        });
    }
};
// GET /agents?agentStatus=&vehicleType=&search=&page=&limit=
export const getAllAgents = async (req: Request, res: Response) => {
    try {
        const { agentStatus, vehicleType, search, page, limit } = req.query;

        const result = await getAllAgentService({
            agentStatus: agentStatus as string | undefined,
            vehicleType: vehicleType as string | undefined,
            search: search as string | undefined,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || "Failed to fetch agents",
        });
    }
};

// GET /agents/:agentId
export const getAgentById = async (req: Request, res: Response) => {
    try {
        const agentId = req.params.agentId as string;
        if (!agentId) {
            return failResponse(res, "Agent ID parameters are required", StatusCode.Bad_Request);
        }
        const agent = await getAgentByIdServcie(agentId);

        return successResponse(res, agent, "Agent fetched successfully", StatusCode.OK);
    } catch (error: any) {
        return failResponse(res, error?.message || error, StatusCode.Bad_Request);
    }
};

// GET /agents/hub/:hubId
export const getAgnetByHubId = async (req: Request, res: Response) => {
    try {
        const hubId = req.params.hubId as string;
        if (!hubId) {
            return failResponse(res, "hubId parameters are required", StatusCode.Bad_Request);
        }
        const agent = await getAgentByHubIdService(hubId, req.query);

        return successResponse(res, agent, "Agents fetched successfully", StatusCode.OK);
    } catch (error: any) {
        return failResponse(res, error?.message || error, StatusCode.Bad_Request);
    }
};

// PATCH /agents/:agentId
export const updateAgent = async (req: Request, res: Response) => {
    try {
        const agentId = req.params.agentId as string;
        if (!agentId) {
            return failResponse(res, "Agent ID is required", StatusCode.Bad_Request);
        }

        const payload = {
            ...req.body,
            updatedBy: (req as any).user?.id || req.body.updatedBy,
            isActive: req.body.isActive !== undefined ? req.body.isActive === "true" : undefined,
        };

        // If photo was uploaded, use the Cloudinary URL
        if (req.file) {
            payload.photo = await uploadToCloudinary(
                req.file.buffer,
                "book-rental/agents",
                `agent-${agentId}-${Date.now()}`
            );
        }

        const updatedAgent = await updateAgentService(agentId, payload);

        return successResponse(res, updatedAgent, "Agent updated successfully", StatusCode.OK);
    } catch (error: any) {
        const message = error?.message || "Failed to update agent";
        const conflictErrors = ["Phone number already exists", "Hub not found"];
        const status = conflictErrors.includes(message) ? 409 : 400;

        return res.status(status).json({
            success: false,
            message,
        });
    }
};

// DELETE /agents/:agentId
export const deleteAgent = async (req: Request, res: Response) => {
    try {
        const agentId = req.params.agentId as string;
        if (!agentId) {
            return failResponse(res, "Agent ID is required", StatusCode.Bad_Request);
        }

        const updatedBy = (req as any).user?.id || req.body.updatedBy;
        const result = await deleteAgentService(agentId, updatedBy);

        return successResponse(res, result, "Agent deleted successfully", StatusCode.OK);
    } catch (error: any) {
        return failResponse(
            res,
            error?.message || "Failed to delete agent",
            StatusCode.Bad_Request
        );
    }
};

export const getAgentShipments = async (req: Request, res: Response) => {
    try {
        const agentId = req.params.agentId as string;

        const shipments = await getAgentShipmentsService(agentId, req.query);

        return successResponse(
            res,
            shipments,
            "Agent shipments fetched successfully.",

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
