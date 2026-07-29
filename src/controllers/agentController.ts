import { METHODS } from "http";
import {
    createAgentService,
    getAgentByHubIdService,
    getAgentByIdServcie,
    getAllAgentService,
} from "../services/agentService";
import { Messages } from "../utils/constants";
import { failResponse, successResponse } from "../utils/response";
import { StatusCode } from "../utils/StatusCodes";
import { Request, Response } from "express";

// POST /agents
export const createAgent = async (req: Request, res: Response) => {
    try {
        const agent = await createAgentService(req.body);

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

export const getAgnetByHubId = async (req: Request, res: Response) => {
    try {
        const hubId = req.params.hubId as string;
        if (!hubId) {
            return failResponse(res, "hubId parameters are required", StatusCode.Bad_Request);
        }
        const agent = await getAgentByHubIdService(hubId);

        return successResponse(res, agent, "Agents fetched successfully", StatusCode.OK);
    } catch (error: any) {
        return failResponse(res, error?.message || error, StatusCode.Bad_Request);
    }
};
