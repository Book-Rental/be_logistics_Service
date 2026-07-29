import Agent from "../models/Agent";
import { LogisticsRole } from "../models/LogisticsAuth";
import { buildPaginationQuery } from "../utils/paginationHelper";
import { createLogisticsUserService } from "./authService";
import Hub from "../models/hub";
import mongoose from "mongoose";

export const getAllAgentService = async (query: {
    agentStatus?: string;
    vehicleType?: string;
    search?: string;
    page?: number;
    limit?: number;
}) => {
    try {
        const { skip, limit, page } = buildPaginationQuery(query);
        const { agentStatus, vehicleType, search } = query;

        // 1. Build initial strict match filters
        const matchStage: any = { isActive: true };

        // NOTE: the schema field is `status`, not `agentStatus` - the query
        // param stays `agentStatus` for API friendliness but must map to
        // the real field, otherwise this filter matches nothing.
        if (agentStatus) {
            matchStage.status = agentStatus;
        }

        if (vehicleType) {
            matchStage.vehicleType = vehicleType;
        }

        // 2. Add text searching capability for agent names or email fields
        if (search) {
            matchStage.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phoneNumber: { $regex: search, $options: "i" } },
            ];
        }

        // 3. High-performance single-pass processing via $facet
        const pipeline: any[] = [
            { $match: matchStage },
            {
                $facet: {
                    data: [{ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit }],
                    totalCount: [{ $count: "count" }],
                },
            },
        ];

        const [facetResult] = await Agent.aggregate(pipeline);

        const rawAgents = facetResult?.data || [];
        const totalRecords = facetResult?.totalCount?.[0]?.count || 0;
        const totalPages = Math.ceil(totalRecords / limit) || 1;
        const hasMore = page < totalPages;

        // 4. Format the final output stream matching your client response structures
        const formattedAgents = rawAgents.map((agent: any) => ({
            agentId: agent._id,
            hubId: agent.hubId,
            name: agent.fullName,
            email: agent.email,
            phone: agent.phoneNumber,
            agentStatus: agent.status,
            vehicleType: agent.vehicleType,
            currentLocation: agent.currentLocation, // Embedded object with coordinates
            joinedAt: agent.createdAt,
        }));

        return {
            agents: formattedAgents,
            meta: {
                totalRecords,
                totalPages,
                currentPage: page,
                limit,
                hasMore,
            },
        };
    } catch (error) {
        throw error;
    }
};

interface CreateAgentPayload {
    password: string;
    hubId: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    vehicleType: string;
    vehicleNumber?: string;
    address?: string;
    emergencyContact?: string;
    notes?: string;
    photo?: string;
    createdBy?: string;
}

export const createAgentService = async (payload: CreateAgentPayload) => {
    const {
        hubId,
        fullName,
        email,
        password,
        phoneNumber,
        vehicleType,
        vehicleNumber,
        address,
        emergencyContact,
        notes,
        photo,
        createdBy,
    } = payload;

    const normalizedEmail = email.toLowerCase();
    const session = await mongoose.startSession();

    try {
        let agent: any;

        await session.withTransaction(async () => {
            // Check Hub exists
            const hub = await Hub.findById(hubId).session(session);
            if (!hub) {
                throw new Error("Hub not found");
            }

            // Check phone number uniqueness
            const existingPhone = await Agent.findOne({ phoneNumber }).session(session);
            if (existingPhone) {
                throw new Error("Phone number already exists");
            }

            // Check email uniqueness
            const existingEmail = await Agent.findOne({ email: normalizedEmail }).session(session);
            if (existingEmail) {
                throw new Error("Email already exists");
            }

            // Create Agent
            [agent] = await Agent.create(
                [
                    {
                        hubId,
                        fullName,
                        email: normalizedEmail,
                        phoneNumber,
                        vehicleType,
                        vehicleNumber,
                        address,
                        emergencyContact,
                        notes,
                        photo,
                        createdBy,
                    },
                ],
                { session }
            );

            // Create Login User - runs inside the same transaction/session so
            // the Agent and its LogisticsAuth record are created atomically
            const logisticsUser = await createLogisticsUserService({
                email: normalizedEmail,
                password,
                role: LogisticsRole.AGENT,
                referenceId: agent._id.toString(),
                createdBy,
                session,
            });

            // Link the Agent back to its login record
            agent.logisticsAuthId = logisticsUser._id;
            await agent.save({ session });
        });

        return agent;
    } finally {
        await session.endSession();
    }
};

export const getAgentByIdServcie = async (agentId: string) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(agentId)) {
            throw new Error("Invalid Agent ID format string requested");
        }

        const agent = await Agent.findOne({ _id: agentId, isActive: true })
            .populate({
                path: "hubId",
                select: "name hubCode",
            })
            .lean();

        if (!agent) {
            throw new Error("Agent profile not found");
        }

        return agent;
    } catch (error) {
        throw error;
    }
};

export const getAgentByHubIdService = async (
    hubId: string,
    query: { page?: number; limit?: number } = {}
) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            throw new Error("Invalid Hub ID format string requested");
        }

        const page = Math.max(1, Number(query.page || 1));
        const limit = Math.max(1, Math.min(100, Number(query.limit || 10)));
        const skip = (page - 1) * limit;

        const filter = { hubId: new mongoose.Types.ObjectId(hubId), isActive: true };

        const [agents, totalRecords] = await Promise.all([
            Agent.find(filter)
                .select(
                    "agentId fullName email phoneNumber status isAvailable vehicleType vehicleNumber currentLocation currentShipmentId photo joinedOn"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Agent.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalRecords / limit) || 1;

        // 4. Zero-overhead transformation map for MFE display components
        const formattedAgents = agents.map((agent: any) => ({
            agentId: agent._id,
            uniqueCode: agent.agentId,
            fullName: agent.fullName,
            email: agent.email,
            phoneNumber: agent.phoneNumber,
            status: agent.status,
            isAvailable: agent.isAvailable,
            vehicle: {
                type: agent.vehicleType,
                number: agent.vehicleNumber,
            },
            currentLocation: agent.currentLocation ?? null,
            currentShipmentId: agent.currentShipmentId ?? null,
            photo: agent.photo ?? null,
            joinedOn: agent.joinedOn,
        }));

        return {
            agents: formattedAgents,
            meta: {
                totalRecords,
                totalPages,
                currentPage: page,
                limit,
                hasMore: page < totalPages,
            },
        };
    } catch (error) {
        throw error;
    }
};
