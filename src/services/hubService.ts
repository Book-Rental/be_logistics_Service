import Hub, { HubStatus } from "../models/hub";
import { createLogisticsUserService } from "./authService";
import { LogisticsRole } from "../models/LogisticsAuth";
import { generateHubDetails } from "../utils/generateHubDetails";
import mongoose from "mongoose";
import { StatusCode } from "../utils/StatusCodes";
import shipment, { JourneyType, ShipmentStatus } from "../models/shipment";

import { HubEmployeeRole } from "../models/HubEmployee";

interface CreateHubPayload {
    hubName: string;
    managerName: string;
    email: string;
    password: string;
    phoneNumber: string;
    address: {
        street: string;
        city: string;
        state: string;
        country: string;
        pincode: string;
    };
    location: {
        type: "Point";
        coordinates: number[];
    };
    capacity?: number;
    createdBy?: string;
    serviceablePincodes: string[];
}

export const getAllHubsService = async () => {
    return await Hub.find().sort({ createdAt: -1 });
};

export const createHubService = async (payload: CreateHubPayload) => {
    const {
        hubName,
        managerName,
        email,
        password,
        phoneNumber,
        address,
        serviceablePincodes,
        location,
        capacity,
        createdBy,
    } = payload;

    const normalizedEmail = email.toLowerCase();
    const session = await mongoose.startSession();

    try {
        let hub: any;

        await session.withTransaction(async () => {
            // Check Phone
            const existingPhone = await Hub.findOne({
                phoneNumber,
            }).session(session);

            if (existingPhone) {
                throw new Error("Phone number already exists");
            }

            // Check Email
            const existingEmail = await Hub.findOne({
                email: normalizedEmail,
            }).session(session);

            if (existingEmail) {
                throw new Error("Email already exists");
            }

            // Check Serviceable Pincode Duplicates (Optional)
            const existingPincode = await Hub.findOne({
                serviceablePincodes: {
                    $in: serviceablePincodes,
                },
            }).session(session);

            if (existingPincode) {
                throw new Error(
                    "One or more serviceable pincodes are already assigned to another hub."
                );
            }

            const { hubId, hubCode } = await generateHubDetails();

            // Create Hub
            [hub] = await Hub.create(
                [
                    {
                        hubId,
                        hubCode,
                        hubName,
                        managerName,
                        email: normalizedEmail,
                        phoneNumber,
                        address,
                        serviceablePincodes,
                        location,
                        capacity,
                        currentLoad: 0,
                        status: HubStatus.ACTIVE,
                        createdBy,
                    },
                ],
                { session }
            );

            // Create Logistics User
            const logisticsUser = await createLogisticsUserService({
                email: normalizedEmail,
                password,
                role: LogisticsRole.HUB_MANAGER,
                referenceId: hub._id.toString(),
                createdBy,
                session,
            });

            // Link Logistics User
            hub.logisticsAuthId = logisticsUser._id;

            await hub.save({ session });
        });

        return hub;
    } finally {
        await session.endSession();
    }
};

//Get Hub By ID Servcie
export const getHubByIdService = async (hubId: string) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            throw new Error("Invalid Hub ID format string requested");
        }
        const hub: any = await Hub.findById(hubId);
        if (!hub) {
            throw new Error("Physical transit hub branch not found");
        }
        return hub;
    } catch (error) {
        throw error;
    }
};

//Finding the Hubs based on the Pincode
export const findHubByPincode = async (pincode: string) => {
    const hub = await Hub.findOne({
        serviceablePincodes: pincode,
        status: "Active",
    });

    if (!hub) {
        throw new Error(`No hub found for pincode ${pincode}`);
    }

    return hub;
};

interface GetShipmentsQuery {
    page?: number;
    limit?: number;
    currentStatus?: string;
    search?: string;
    paymentMode?: string;
    journeyType?: JourneyType; // Fixed: Kept optional to match interface strategy
}

export const getShipmentsByHubService = async (hubId: string, query: GetShipmentsQuery = {}) => {
    try {
        // 1. Fail-fast guard against malformed MongoDB ObjectIDs
        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            throw Object.assign(new Error("Invalid Hub ID format string requested"), {
                statusCode: 400,
            });
        }

        // Validate hub existence to prevent empty response confusion
        const hub = await Hub.findById(hubId).lean();
        if (!hub) {
            throw Object.assign(new Error("Physical transit hub branch not found"), {
                statusCode: 404,
            });
        }

        // 2. Setup uniform pagination calculations
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.max(1, Number(query.limit) || 10);
        const skip = (page - 1) * limit;

        const { currentStatus, search, paymentMode, journeyType } = query;

        // 3. Construct base filter criteria targeting the current hub index
        const matchFilter: any = {
            currentHubId: new mongoose.Types.ObjectId(hubId),
        };

        if (currentStatus) {
            matchFilter.currentStatus = currentStatus;
        }

        if (paymentMode) {
            matchFilter.paymentMode = paymentMode;
        }

        // Fixed: Added mapping for journeyType filter
        if (journeyType) {
            matchFilter.journeyType = journeyType;
        }

        // 4. Handle text searches efficiently
        if (search) {
            const trimmedSearch = search.trim();
            const searchConditions: any[] = [
                { awbNumber: { $regex: trimmedSearch, $options: "i" } },
                { "receiver.name": { $regex: trimmedSearch, $options: "i" } },
                { "receiver.city": { $regex: trimmedSearch, $options: "i" } },
            ];

            // Avoid heavy $toString scans: parse search term directly if it's a valid hex string
            if (mongoose.Types.ObjectId.isValid(trimmedSearch)) {
                const searchObjectId = new mongoose.Types.ObjectId(trimmedSearch);
                searchConditions.push({ orderId: searchObjectId });
                searchConditions.push({ orderItemId: searchObjectId });
            }

            matchFilter.$or = searchConditions;
        }

        // 5. Execute unified single-pass aggregation pipeline using $facet
        const [facetResult] = await shipment.aggregate([
            { $match: matchFilter },
            {
                $facet: {
                    metadata: [{ $count: "totalRecords" }],
                    data: [
                        { $sort: { createdAt: -1 } },
                        { $skip: skip },
                        { $limit: limit },
                        // Populate originHubId manually
                        {
                            $lookup: {
                                from: "hubs", // Ensure this matches collection name exactly
                                localField: "originHubId",
                                foreignField: "_id",
                                as: "originHub",
                            },
                        },
                        { $unwind: { path: "$originHub", preserveNullAndEmptyArrays: true } },
                        // Populate destinationHubId manually
                        {
                            $lookup: {
                                from: "hubs",
                                localField: "destinationHubId",
                                foreignField: "_id",
                                as: "destinationHub",
                            },
                        },
                        { $unwind: { path: "$destinationHub", preserveNullAndEmptyArrays: true } },
                        // Populate currentAgentId manually
                        {
                            $lookup: {
                                from: "hubemployees",

                                let: {
                                    agentId: "$currentAgentId",
                                },

                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    {
                                                        $eq: [
                                                            "$_id",
                                                            "$$agentId",
                                                        ],
                                                    },
                                                    {
                                                        $eq: [
                                                            "$role",
                                                            HubEmployeeRole.AGENT,
                                                        ],
                                                    },
                                                    // {
                                                    //     $eq: [
                                                    //         "$isActive",
                                                    //         true,
                                                    //     ],
                                                    // },
                                                ],
                                            },
                                        },
                                    },
                                ],

                                as: "assignedAgent",
                            },
                        },
                        { $unwind: { path: "$assignedAgent", preserveNullAndEmptyArrays: true } },
                        // Output layer filtering out payload fields
                        {
                            $project: {
                                _id: 1,
                                awbNumber: 1,
                                orderId: 1,
                                orderItemId: 1,
                                shipmentType: 1,
                                currentStatus: 1,
                                paymentMode: 1,
                                codAmount: 1,
                                expectedDeliveryDate: 1,
                                createdAt: 1,
                                receiver: 1,
                                journeyType: 1,
                                "originHub._id": 1,
                                "originHub.name": 1,
                                "originHub.hubCode": 1,
                                "originHub.city": 1,
                                "destinationHub._id": 1,
                                "destinationHub.name": 1,
                                "destinationHub.hubCode": 1,
                                "destinationHub.city": 1,
                                "assignedAgent._id": 1,
                                "assignedAgent.fullName": 1,
                                "assignedAgent.phoneNumber": 1,
                                "assignedAgent.status": 1,
                            },
                        },
                    ],
                },
            },
        ]);

        // Extract numbers safely out of facet response structural wrapper
        const totalRecords = facetResult?.metadata[0]?.totalRecords || 0;
        const totalPages = Math.ceil(totalRecords / limit) || 1;
        const rawShipments = facetResult?.data || [];

        // 6. Map raw records to clean API response schema
        const formattedShipments = rawShipments.map((ship: any) => ({
            shipmentId: ship._id,
            awbNumber: ship.awbNumber || null,
            orderId: ship.orderId,
            orderItemId: ship.orderItemId,
            shipmentType: ship.shipmentType,
            currentStatus: ship.currentStatus,
            paymentMode: ship.paymentMode,
            codAmount: ship.codAmount,
            expectedDeliveryDate: ship.expectedDeliveryDate,
            journeyType: ship.journeyType || null,
            originHub: ship.originHub
                ? {
                    _id: ship.originHub._id,
                    name: ship.originHub.name,
                    hubCode: ship.originHub.hubCode,
                    city: ship.originHub.city,
                }
                : null,
            destinationHub: ship.destinationHub
                ? {
                    _id: ship.destinationHub._id,
                    name: ship.destinationHub.name,
                    hubCode: ship.destinationHub.hubCode,
                    city: ship.destinationHub.city,
                }
                : null,
            assignedAgent: ship.assignedAgent
                ? {
                    _id: ship.assignedAgent._id,
                    fullName: ship.assignedAgent.fullName,
                    phoneNumber: ship.assignedAgent.phoneNumber,
                    status: ship.assignedAgent.status,
                }
                : null,
            receiverName: ship.receiver?.name ?? null,
            receiverCity: ship.receiver?.city ?? null,
            createdAt: ship.createdAt,
        }));

        return {
            shipments: formattedShipments,
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

interface GetShipmentsByPincodeQuery {
    pincode?: string;
    page?: number; // Added pagination fields for production safety
    limit?: number;
    journeyType?: JourneyType; // Optional filter for journey type
    status?: ShipmentStatus; // Optional filter for shipment status
    agentId?: string; // Optional filter for assigned agent
}

export const getShipmentsByReceiverZipCodeService = async (
    hubId: string,
    query: GetShipmentsByPincodeQuery = {}
) => {
    try {
        // 1. Guard check for valid structural ObjectID
        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            const error: any = new Error("Invalid Hub ID.");
            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // Validate that the hub branch exists
        const hub = await Hub.findById(hubId).lean();
        if (!hub) {
            const error: any = new Error("Hub not found.");
            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        // 2. Setup standard pagination math defaults
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.max(1, Number(query.limit) || 10);
        const skip = (page - 1) * limit;

        // 3. Construct indexing criteria using the correct casing
        const filter: any = {
            currentHubId: new mongoose.Types.ObjectId(hubId),
        };
        if (query.status) {
            filter.currentStatus = query.status;
        } else {
            // filter.currentStatus = ShipmentStatus.ARRIVED_AT_DESTINATION_HUB;
        }
        if (query.journeyType) {
            filter.journeyType = query.journeyType;
        }
        if (query.agentId && mongoose.Types.ObjectId.isValid(query.agentId)) {
            filter.currentAgentId = new mongoose.Types.ObjectId(query.agentId);
        }

        // Handle structural check on incoming query string parameters
        if (query.pincode && query.pincode.trim() !== "") {
            filter["receiver.pincode"] = query.pincode.trim();
        }

        // 4. Parallel data fetches using capitalized schema class names
        const [rawShipments, totalRecords] = await Promise.all([
            shipment
                .find(filter) // 🚀 Corrected from lower-case 'shipment' to upper-case 'Shipment'
                .populate("currentAgentId", "fullName phoneNumber")
                .populate("originHubId", "hubName hubCode")
                .populate("destinationHubId", "hubName hubCode")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            shipment.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalRecords / limit) || 1;

        // 5. Structure fields output payload matching requirements
        const formattedShipments = rawShipments.map((ship: any) => ({
            shipmentId: ship._id,
            awbNumber: ship.awbNumber || null,
            orderId: ship.orderId,
            orderItemId: ship.orderItemId,
            shipmentType: ship.shipmentType,
            journeyType: ship.journeyType,
            currentStatus: ship.currentStatus,
            paymentMode: ship.paymentMode,
            codAmount: ship.codAmount,
            receiver: ship.receiver || null,
            originHub: ship.originHubId || null,
            destinationHub: ship.destinationHubId || null,
            assignedAgent: ship.currentAgentId || null,
            expectedDeliveryDate: ship.expectedDeliveryDate,
            createdAt: ship.createdAt,
        }));

        return {
            shipments: formattedShipments,
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

export const checkHubServiceabilityService = async (pincode: string) => {
    try {
        if (!pincode || pincode.trim() === "") {
            throw new Error("Pincode is required for serviceability check.");
        }

        const hub = await Hub.findOne({
            serviceablePincodes: pincode.trim(),
            status: HubStatus.ACTIVE,
        });

        return !!hub; // Returns true if a hub is found, false otherwise
    } catch (error) {
        throw error;
    }
};
