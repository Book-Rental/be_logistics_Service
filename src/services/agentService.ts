import Agent, { AgentStatus } from "../models/Agent";
import { LogisticsRole } from "../models/LogisticsAuth";
import { buildPaginationQuery } from "../utils/paginationHelper";
import { createLogisticsUserService } from "./authService";
import Hub from "../models/hub";
import mongoose from "mongoose";
import shipment from "../models/shipment";
import { StatusCode } from "../utils/StatusCodes";

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
    isActive?: boolean;
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
        isActive,
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
                        isActive,
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
    query: { page?: number; limit?: number; status?: AgentStatus } = {}
) => {
    try {
        // 1. Fail-fast guard against malformed ObjectId casting exceptions
        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            const error: any = new Error("Invalid Hub ID format string requested");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // 2. Setup uniform pagination boundary data via your helper utility
        const { skip, limit, page } = buildPaginationQuery(query);

        // This main search filter respects user query changes
        const searchFilter = {
            hubId: new mongoose.Types.ObjectId(hubId),
            isActive: true,
            ...(query.status ? { status: query.status } : {}),
        };

        // Base query layout used strictly to fetch complete status analytics for this Hub
        const hubSummaryFilter = {
            hubId: new mongoose.Types.ObjectId(hubId),
            isActive: true,
        };

        // 3. Parallelized data fetching, pagination matching, and structural count analytics counters
        const [
            agents,
            totalRecords,
            totalHubAgents,
            activeHubAgents,
            inactiveHubAgents,
            offDutyHubAgents,
        ] = await Promise.all([
            // Paginated record subset
            Agent.find(searchFilter)
                .select(
                    "agentId fullName email phoneNumber status isAvailable vehicleType vehicleNumber currentLocation currentShipmentId photo joinedOn"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            // Total records matching current filtered search criteria (for page counts)
            Agent.countDocuments(searchFilter),

            // 🚀 Analytics Counters: Checked across the entire hub, ignoring current viewport status filters
            Agent.countDocuments(hubSummaryFilter),
            Agent.countDocuments({ ...hubSummaryFilter, status: "Active" }), // Adjust lowercase/uppercase to match your Enum exactly
            Agent.countDocuments({ ...hubSummaryFilter, status: "Inactive" }), // Adjust lowercase/uppercase to match your Enum exactly
            Agent.countDocuments({ ...hubSummaryFilter, status: "Off Duty" }), // Adjust lowercase/uppercase to match your Enum exactly
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
            analytics: {
                totalAgents: totalHubAgents,
                activeAgents: activeHubAgents,
                inactiveAgents: inactiveHubAgents,
                offDutyAgents: offDutyHubAgents,
            },
            meta: {
                totalRecords, // Items matching current active query filter combinations
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

interface UpdateAgentPayload {
    fullName?: string;
    phoneNumber?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    address?: string;
    emergencyContact?: string;
    notes?: string;
    photo?: string;
    status?: string;
    hubId?: string;
    isActive?: boolean;
    updatedBy?: string;
    isAvailable?: boolean;
}

export const updateAgentService = async (agentId: string, payload: UpdateAgentPayload) => {
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
        throw new Error("Invalid Agent ID");
    }

    const session = await mongoose.startSession();

    try {
        let updatedAgent: any;

        await session.withTransaction(async () => {
            const agent = await Agent.findById(agentId).session(session);
            if (!agent) {
                throw new Error("Agent not found");
            }

            // If phoneNumber is being changed, check uniqueness
            if (payload.phoneNumber && payload.phoneNumber !== agent.phoneNumber) {
                const existingPhone = await Agent.findOne({
                    phoneNumber: payload.phoneNumber,
                    _id: { $ne: agentId },
                }).session(session);

                if (existingPhone) {
                    throw new Error("Phone number already exists");
                }
            }

            // If hubId is being changed, validate hub exists
            if (payload.hubId) {
                const hub = await Hub.findById(payload.hubId).session(session);
                if (!hub) {
                    throw new Error("Hub not found");
                }
            }

            // Update allowed fields
            const allowedFields = [
                "fullName",
                "phoneNumber",
                "vehicleType",
                "vehicleNumber",
                "address",
                "emergencyContact",
                "notes",
                "photo",
                "status",
                "hubId",
                "isActive",
                "isAvailable",
            ];

            for (const field of allowedFields) {
                if (payload[field as keyof UpdateAgentPayload] !== undefined) {
                    (agent as any)[field] = payload[field as keyof UpdateAgentPayload];
                }
            }

            if (payload.updatedBy) {
                agent.updatedBy = new mongoose.Types.ObjectId(payload.updatedBy);
            }

            await agent.save({ session });
            updatedAgent = agent;
        });

        // Return populated agent
        return await Agent.findById(agentId)
            .populate({ path: "hubId", select: "name hubCode" })
            .lean();
    } finally {
        await session.endSession();
    }
};

export const deleteAgentService = async (agentId: string, updatedBy?: string) => {
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
        throw new Error("Invalid Agent ID");
    }

    const session = await mongoose.startSession();

    try {
        let result: any;

        await session.withTransaction(async () => {
            const agent = await Agent.findById(agentId).session(session);
            if (!agent || !agent.isActive) {
                throw new Error("Agent not found");
            }

            // Soft delete the agent
            agent.isActive = false;
            agent.status = AgentStatus.INACTIVE;
            if (updatedBy) {
                agent.updatedBy = new mongoose.Types.ObjectId(updatedBy);
            }
            await agent.save({ session });

            // Deactivate the associated LogisticsAuth record
            if (agent.logisticsAuthId) {
                await mongoose.model("LogisticsAuth").findByIdAndUpdate(
                    agent.logisticsAuthId,
                    {
                        $set: {
                            isActive: false,
                            status: "BLOCKED",
                            updatedBy: updatedBy
                                ? new mongoose.Types.ObjectId(updatedBy)
                                : undefined,
                        },
                    },
                    { session }
                );
            }

            result = { agentId: agent._id, isActive: false };
        });

        return result;
    } finally {
        await session.endSession();
    }
};

export const getAgentShipmentsService = async (agentId: string) => {
    const shipments = await shipment
        .find({
            currentAgentId: agentId,
            currentStatus: {
                $nin: ["Delivered", "Returned", "Cancelled"],
            },
        })
        .populate("originHubId", "hubName hubCode address")
        .populate("destinationHubId", "hubName hubCode address")
        .populate("currentAgentId", "fullName phoneNumber")
        .sort({ createdAt: -1 });

    return shipments;
};
