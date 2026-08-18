
import LogisticsAuth, { LogisticsRole, LogisticsUserStatus } from "../models/LogisticsAuth";
import { buildPaginationQuery } from "../utils/paginationHelper";
import { createLogisticsUserService } from "./authService";
import Hub from "../models/hub";
import mongoose, { Types } from "mongoose";
import shipment from "../models/shipment";
import { StatusCode } from "../utils/StatusCodes";
import hubEmployee, {
    HubEmployeeRole,
    HubEmployeeStatus,
    VehicleType,

} from "../models/hubEmployee";
import HubEmployee from "../models/hubEmployee";
import { generateEmployeeId } from "../utils/shipment";

export const getAllAgentService = async (query: {
    agentStatus?: HubEmployeeStatus;
    vehicleType?: string;
    search?: string;
    page?: number;
    limit?: number;
}) => {
    try {
        // -----------------------------------------
        // 1. Pagination
        // -----------------------------------------

        const { skip, limit, page } =
            buildPaginationQuery(query);

        const {
            agentStatus,
            vehicleType,
            search,
        } = query;

        // -----------------------------------------
        // 2. Build Match Filter
        // -----------------------------------------

        const matchStage: any = {
            // Only active employees
            isActive: true,

            // Only Agents
            role: HubEmployeeRole.AGENT,
        };

        // -----------------------------------------
        // 3. Status Filter
        // -----------------------------------------

        if (agentStatus) {
            matchStage.status = agentStatus;
        }

        // -----------------------------------------
        // 4. Vehicle Type Filter
        // -----------------------------------------

        if (vehicleType) {
            matchStage.vehicleType = vehicleType;
        }

        // -----------------------------------------
        // 5. Search
        // -----------------------------------------

        if (search?.trim()) {
            const searchValue = search.trim();

            matchStage.$or = [
                {
                    employeeId: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
                {
                    fullName: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
                {
                    email: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
                {
                    phoneNumber: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
            ];
        }

        // -----------------------------------------
        // 6. Aggregation
        // -----------------------------------------

        const [facetResult] =
            await HubEmployee.aggregate([
                {
                    $match: matchStage,
                },

                {
                    $facet: {
                        data: [
                            {
                                $sort: {
                                    createdAt: -1,
                                },
                            },

                            {
                                $skip: skip,
                            },

                            {
                                $limit: limit,
                            },

                            // Get Hub details
                            {
                                $lookup: {
                                    from: "hubs",
                                    localField: "hubId",
                                    foreignField: "_id",
                                    as: "hub",
                                },
                            },

                            {
                                $unwind: {
                                    path: "$hub",
                                    preserveNullAndEmptyArrays: true,
                                },
                            },

                            {
                                $project: {
                                    _id: 1,
                                    employeeId: 1,
                                    hubId: 1,
                                    fullName: 1,
                                    email: 1,
                                    phoneNumber: 1,
                                    role: 1,
                                    status: 1,
                                    isAvailable: 1,
                                    vehicleType: 1,
                                    vehicleNumber: 1,
                                    currentLocation: 1,
                                    currentShipmentId: 1,
                                    photo: 1,
                                    joinedOn: 1,
                                    createdAt: 1,

                                    "hub._id": 1,
                                    "hub.name": 1,
                                    "hub.hubCode": 1,
                                },
                            },
                        ],

                        totalCount: [
                            {
                                $count: "count",
                            },
                        ],
                    },
                },
            ]);

        // -----------------------------------------
        // 7. Pagination Data
        // -----------------------------------------

        const rawAgents =
            facetResult?.data || [];

        const totalRecords =
            facetResult?.totalCount?.[0]?.count || 0;

        const totalPages =
            Math.ceil(totalRecords / limit) || 1;

        const hasMore =
            page < totalPages;

        // -----------------------------------------
        // 8. Format Agents
        // -----------------------------------------

        const formattedAgents =
            rawAgents.map((agent: any) => ({
                // MongoDB ID
                agentId: agent._id,

                // Business Employee ID
                employeeId: agent.employeeId,

                hubId: agent.hubId,

                hub: agent.hub
                    ? {
                          _id: agent.hub._id,
                          name: agent.hub.name,
                          hubCode: agent.hub.hubCode,
                      }
                    : null,

                name: agent.fullName,

                email: agent.email,

                phone: agent.phoneNumber,

                role: agent.role,

                agentStatus: agent.status,

                isAvailable:
                    agent.isAvailable,

                vehicle: {
                    type:
                        agent.vehicleType ??
                        null,

                    number:
                        agent.vehicleNumber ??
                        null,
                },

                currentLocation:
                    agent.currentLocation ??
                    null,

                currentShipmentId:
                    agent.currentShipmentId ??
                    null,

                photo:
                    agent.photo ??
                    null,

                joinedAt:
                    agent.joinedOn ??
                    agent.createdAt,
            }));

        // -----------------------------------------
        // 9. Response
        // -----------------------------------------

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

export interface CreateHubEmployeePayload {
    hubId: string;

    fullName: string;
    email: string;
    password: string;
    phoneNumber: string;

    role: HubEmployeeRole;

    vehicleType?: VehicleType;
    vehicleNumber?: string;

    address?: string;
    emergencyContact?: string;
    notes?: string;
    photo?: string;

    createdBy?: Types.ObjectId;

    isActive?: boolean;
}

export const createAgentService = async (
    payload: CreateHubEmployeePayload
) => {
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

    const normalizedEmail = email.toLowerCase().trim();

    const session = await mongoose.startSession();

    try {
        let hubEmployee: any;

        await session.withTransaction(async () => {
            // -----------------------------------------
            // 1. Check Hub exists
            // -----------------------------------------

            const hub = await Hub.findById(hubId).session(session);

            if (!hub) {
                const error: any = new Error("Hub not found");
                error.statusCode = StatusCode.Not_Found;
                throw error;
            }

            // -----------------------------------------
            // 2. Check Phone Number
            // -----------------------------------------

            const existingPhone = await HubEmployee.findOne({
                phoneNumber,
            }).session(session);

            if (existingPhone) {
                const error: any = new Error(
                    "Phone number already exists"
                );

                error.statusCode = StatusCode.Conflict;
                throw error;
            }

            // -----------------------------------------
            // 3. Check Email
            // -----------------------------------------

            const existingEmail = await HubEmployee.findOne({
                email: normalizedEmail,
            }).session(session);

            if (existingEmail) {
                const error: any = new Error(
                    "Email already exists"
                );

                error.statusCode = StatusCode.Conflict;
                throw error;
            }

            // -----------------------------------------
            // 4. Generate Employee ID
            // -----------------------------------------

            let employeeId: string;

            do {
                employeeId = generateEmployeeId();

                const existingEmployeeId =
                    await HubEmployee.findOne({
                        employeeId,
                    }).session(session);

                if (!existingEmployeeId) {
                    break;
                }
            } while (true);

            // -----------------------------------------
            // 5. Create Hub Employee / Agent
            // -----------------------------------------

            [hubEmployee] = await HubEmployee.create(
                [
                    {
                        // MongoDB automatically creates _id
                        // Business-level employee ID
                        employeeId,

                        hubId,

                        fullName,

                        email: normalizedEmail,

                        phoneNumber,

                        // This service creates only Agent
                        role: HubEmployeeRole.AGENT,

                        vehicleType,

                        vehicleNumber,

                        address,

                        emergencyContact,

                        notes,

                        photo,

                        createdBy,

                        isActive:
                            isActive !== undefined
                                ? isActive
                                : true,
                    },
                ],
                {
                    session,
                }
            );

            // -----------------------------------------
            // 6. Create Logistics Login
            // -----------------------------------------

            const logisticsUser =
                await createLogisticsUserService({
                    email: normalizedEmail,

                    password,

                    role: LogisticsRole.AGENT,

                    referenceId:
                        hubEmployee._id.toString(),

                    createdBy:
                        createdBy?.toString(),

                    session,
                });

            // -----------------------------------------
            // 7. Link Logistics Auth
            // -----------------------------------------

            hubEmployee.logisticsAuthId =
                logisticsUser._id;

            await hubEmployee.save({
                session,
            });
        });

        return hubEmployee;
    } finally {
        await session.endSession();
    }
};

export const getAgentByIdService = async (agentId: string) => {
    try {
        // -----------------------------------------
        // 1. Validate Agent ID
        // -----------------------------------------

        if (!mongoose.Types.ObjectId.isValid(agentId)) {
            const error: any = new Error("Invalid Agent ID format string requested");

            error.statusCode = StatusCode.Bad_Request;

            throw error;
        }

        // -----------------------------------------
        // 2. Find Agent
        // -----------------------------------------

        const agent = await HubEmployee.findOne({
            _id: agentId,
            role: HubEmployeeRole.AGENT,
            // isActive: true,
        })
            .populate({
                path: "hubId",
                select: "name hubCode",
            })
            .lean();

        // -----------------------------------------
        // 3. Agent not found
        // -----------------------------------------

        if (!agent) {
            const error: any = new Error("Agent profile not found");

            error.statusCode = StatusCode.Not_Found;

            throw error;
        }

        return agent;
    } catch (error) {
        throw error;
    }
};
export const getAgentByHubIdService = async (
    hubId: string,
    query: {
        page?: number;
        limit?: number;
        status?: HubEmployeeStatus;
    } = {}
) => {
    try {
        // -----------------------------------------
        // 1. Validate Hub ID
        // -----------------------------------------

        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            const error: any = new Error("Invalid Hub ID format string requested");

            error.statusCode = StatusCode.Bad_Request;

            throw error;
        }

        // -----------------------------------------
        // 2. Pagination
        // -----------------------------------------

        const { skip, limit, page } = buildPaginationQuery(query);

        const hubObjectId = new mongoose.Types.ObjectId(hubId);

        // -----------------------------------------
        // 3. Base Agent Filter
        // -----------------------------------------

        const baseAgentFilter = {
            hubId: hubObjectId,
            role: HubEmployeeRole.AGENT,
        };

        // -----------------------------------------
        // 4. Search Filter
        // -----------------------------------------

        const searchFilter = {
            ...baseAgentFilter,

            ...(query.status
                ? {
                    status: query.status,
                }
                : {}),
        };

        // -----------------------------------------
        // 5. Fetch Agents + Analytics
        // -----------------------------------------

        const [
            agents,
            totalRecords,
            totalHubAgents,
            activeHubAgents,
            inactiveHubAgents,
            offDutyHubAgents,
            onDeliveryHubAgents,
        ] = await Promise.all([
            // -----------------------------------------
            // Paginated Agents
            // -----------------------------------------

            HubEmployee.find(searchFilter)
                .select(
                    "employeeId fullName email phoneNumber role status isAvailable vehicleType vehicleNumber currentLocation currentShipmentId photo joinedOn isActive"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            // -----------------------------------------
            // Total filtered agents
            // -----------------------------------------

            HubEmployee.countDocuments(searchFilter),

            // -----------------------------------------
            // Total agents
            // -----------------------------------------

            HubEmployee.countDocuments(baseAgentFilter),

            // -----------------------------------------
            // Active agents
            // -----------------------------------------

            HubEmployee.countDocuments({
                ...baseAgentFilter,
                status: HubEmployeeStatus.ACTIVE,
            }),

            // -----------------------------------------
            // Inactive agents
            // -----------------------------------------

            HubEmployee.countDocuments({
                hubId: hubObjectId,
                role: HubEmployeeRole.AGENT,
                status: HubEmployeeStatus.INACTIVE,
            }),

            // -----------------------------------------
            // Off Duty agents
            // -----------------------------------------

            HubEmployee.countDocuments({
                ...baseAgentFilter,
                status: HubEmployeeStatus.OFF_DUTY,
            }),

            // -----------------------------------------
            // On Delivery agents
            // -----------------------------------------

            HubEmployee.countDocuments({
                ...baseAgentFilter,
                status: HubEmployeeStatus.ON_DELIVERY,
            }),
        ]);

        // -----------------------------------------
        // 7. Pagination
        // -----------------------------------------

        const totalPages = Math.ceil(totalRecords / limit) || 1;

        // -----------------------------------------
        // 8. Format Agents
        // -----------------------------------------
        // console.log("ALL HUB EMPLOYEES:", agents);
        const formattedAgents = agents.map((agent: any) => ({
            agentId: agent._id,

            employeeId: agent.employeeId,

            fullName: agent.fullName,

            email: agent.email,

            phoneNumber: agent.phoneNumber,

            role: agent.role,

            status: agent.status,

            isAvailable: agent.isAvailable,

            vehicle: {
                type: agent.vehicleType ?? null,
                number: agent.vehicleNumber ?? null,
            },

            currentLocation: agent.currentLocation ?? null,

            currentShipmentId: agent.currentShipmentId ?? null,

            photo: agent.photo ?? null,

            joinedOn: agent.joinedOn,
        }));

        // -----------------------------------------
        // 9. Return
        // -----------------------------------------

        return {
            agents: formattedAgents,

            analytics: {
                totalAgents: totalHubAgents,
                activeAgents: activeHubAgents,
                inactiveAgents: inactiveHubAgents,
                offDutyAgents: offDutyHubAgents,
                onDeliveryAgents: onDeliveryHubAgents,
            },

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
    // -----------------------------------------
    // 1. Validate Agent ID
    // -----------------------------------------

    if (!mongoose.Types.ObjectId.isValid(agentId)) {
        const error: any = new Error("Invalid Agent ID");
        error.statusCode = StatusCode.Bad_Request;
        throw error;
    }

    const session = await mongoose.startSession();

    try {
        let updatedAgent: any;

        await session.withTransaction(async () => {
            // -----------------------------------------
            // 2. Find Agent
            // -----------------------------------------

            const agent = await HubEmployee.findOne({
                _id: agentId,
                role: HubEmployeeRole.AGENT,
            }).session(session);

            if (!agent) {
                const error: any = new Error("Agent not found");

                error.statusCode = StatusCode.Not_Found;

                throw error;
            }

            // -----------------------------------------
            // 3. Check Phone Number
            // -----------------------------------------

            if (payload.phoneNumber && payload.phoneNumber !== agent.phoneNumber) {
                const existingPhone = await HubEmployee.findOne({
                    phoneNumber: payload.phoneNumber,
                    _id: {
                        $ne: agentId,
                    },
                }).session(session);

                if (existingPhone) {
                    const error: any = new Error("Phone number already exists");

                    error.statusCode = StatusCode.Conflict;

                    throw error;
                }
            }

            // -----------------------------------------
            // 4. Validate Hub
            // -----------------------------------------

            if (payload.hubId) {
                if (!mongoose.Types.ObjectId.isValid(payload.hubId)) {
                    const error: any = new Error("Invalid Hub ID");

                    error.statusCode = StatusCode.Bad_Request;

                    throw error;
                }

                const hub = await Hub.findById(payload.hubId).session(session);

                if (!hub) {
                    const error: any = new Error("Hub not found");

                    error.statusCode = StatusCode.Not_Found;

                    throw error;
                }

                agent.hubId = new mongoose.Types.ObjectId(payload.hubId);
            }

            // -----------------------------------------
            // 5. Update Allowed Fields
            // -----------------------------------------

            const allowedFields: Array<keyof UpdateAgentPayload> = [
                "fullName",
                "phoneNumber",
                "vehicleType",
                "vehicleNumber",
                "address",
                "emergencyContact",
                "notes",
                "photo",
                "status",
                "isActive",
                "isAvailable",
            ];

            for (const field of allowedFields) {
                const value = payload[field];

                if (value !== undefined) {
                    (agent as any)[field] = value;
                }
            }

            // -----------------------------------------
            // 6. Updated By
            // -----------------------------------------

            if (payload.updatedBy) {
                agent.updatedBy = new mongoose.Types.ObjectId(payload.updatedBy);
            }

            // -----------------------------------------
            // 7. Save Agent
            // -----------------------------------------

            await agent.save({
                session,
            });

            updatedAgent = agent;
        });

        // -----------------------------------------
        // 8. Return Updated Agent
        // -----------------------------------------

        const result = await HubEmployee.findOne({
            _id: agentId,
            role: HubEmployeeRole.AGENT,
        })
            .populate({
                path: "hubId",
                select: "name hubCode",
            })
            .lean();

        if (!result) {
            const error: any = new Error("Updated Agent not found");

            error.statusCode = StatusCode.Not_Found;

            throw error;
        }

        return result;
    } finally {
        await session.endSession();
    }
};

export const deleteAgentService = async (agentId: string, updatedBy?: string) => {
    // -----------------------------------------
    // 1. Validate Agent ID
    // -----------------------------------------

    if (!mongoose.Types.ObjectId.isValid(agentId)) {
        const error: any = new Error("Invalid Agent ID");
        error.statusCode = StatusCode.Bad_Request;
        throw error;
    }

    const session = await mongoose.startSession();

    try {
        let result: any;

        await session.withTransaction(async () => {
            // -----------------------------------------
            // 2. Find Agent from HubEmployee
            // -----------------------------------------

            const agent = await HubEmployee.findOne({
                _id: agentId,
                role: HubEmployeeRole.AGENT,
            }).session(session);

            if (!agent) {
                const error: any = new Error("Agent not found");

                error.statusCode = StatusCode.Not_Found;

                throw error;
            }

            // -----------------------------------------
            // 3. Soft Delete Agent
            // -----------------------------------------

            agent.isActive = false;
            agent.status = HubEmployeeStatus.INACTIVE;

            if (updatedBy) {
                agent.updatedBy = new mongoose.Types.ObjectId(updatedBy);
            }

            await agent.save({
                session,
            });

            // -----------------------------------------
            // 4. Find LogisticsAuth using referenceId
            // -----------------------------------------

            const logisticsAuth = await LogisticsAuth.findOne({
                referenceId: agent._id,
                role: LogisticsRole.AGENT,
            }).session(session);

            // -----------------------------------------
            // 5. Deactivate Login Account
            // -----------------------------------------

            if (logisticsAuth) {
                logisticsAuth.isActive = false;
                logisticsAuth.status = LogisticsUserStatus.BLOCKED;

                if (updatedBy) {
                    logisticsAuth.updatedBy = new mongoose.Types.ObjectId(updatedBy);
                }

                await logisticsAuth.save({
                    session,
                });
            }

            // -----------------------------------------
            // 6. Response
            // -----------------------------------------

            result = {
                agentId: agent._id,
                isActive: false,
                status: HubEmployeeStatus.INACTIVE,
            };
        });

        return result;
    } finally {
        await session.endSession();
    }
};
export const getAgentShipmentsService = async (
    agentId: string,
    query: { page?: number; limit?: number }
) => {
    // 1. Destructure pagination variables from your utility helper
    const { skip, limit, page } = buildPaginationQuery(query);

    // 2. Define the filter criteria
    const filter = {
        currentAgentId: agentId,
        currentStatus: {
            $nin: ["Delivered", "Returned", "Cancelled"],
        },
    };

    // 3. Run queries in parallel for better response times
    const [shipments, totalDocs] = await Promise.all([
        shipment
            .find(filter)
            .populate("originHubId", "hubName hubCode address")
            .populate("destinationHubId", "hubName hubCode address")
            .populate("currentAgentId", "fullName phoneNumber")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(), // Returns plain JS objects for faster performance
        shipment.countDocuments(filter),
    ]);

    // 4. Return paginated result payload
    return {
        data: shipments,
        pagination: {
            totalDocs,
            currentPage: page,
            limit,
            totalPages: Math.ceil(totalDocs / limit),
            hasNextPage: page * limit < totalDocs,
            hasPrevPage: page > 1,
        },
    };
};
