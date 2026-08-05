import Hub, { HubStatus } from "../models/hub";
import { createLogisticsUserService } from "./authService";
import { LogisticsRole } from "../models/LogisticsAuth";
import { generateHubDetails } from "../utils/generateHubDetails";
import mongoose from "mongoose";
import { StatusCode } from "../utils/StatusCodes";
import shipment from "../models/shipment";
import { buildPaginationQuery } from "../utils/paginationHelper";

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

export const getShipmentsByHubService = async (
    hubId: string,
    query: { page?: number; limit?: number; currentStatus?: string } = {}
) => {
    try {
        // 1. Fail-fast guard preventing MongoDB document casting format exceptions
        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            throw new Error("Invalid Hub ID format string requested");
        }

        const hub = await Hub.findById(hubId).lean();
        if (!hub) {
            throw new Error("Physical transit hub branch not found");
        }

        // 2. Setup standard pagination calculations
        const { skip, limit, page } = buildPaginationQuery(query);
        const { currentStatus } = query;
        console.log(
            "skip",
            skip,
            "limit",
            limit,
            "page",
            page,
            "currentStatus",
            query.page,
            query.limit,
            query.currentStatus
        );
        // 3. Construct direct index filter matching structures
        const filter: any = {
            currentHubId: new mongoose.Types.ObjectId(hubId), // 🚀 Explicit conversion ensures index optimization hits
        };

        // Allow filtering shipments by status dynamically inside the Hub queues (e.g., "In Transit", "Reached Hub")
        if (currentStatus) {
            filter.currentStatus = currentStatus;
        }

        // 4. Parallelize count tracking metrics and record population fetches to drop response latency
        const [rawShipments, totalRecords] = await Promise.all([
            shipment
                .find(filter)
                .populate("originHubId", "name hubCode city") // Adjust fields based on your Hub schema parameters
                .populate("destinationHubId", "name hubCode city")
                .populate("currentAgentId", "fullName phoneNumber status")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(), // 🚀 Drastically cuts down server memory allocations
            shipment.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalRecords / limit) || 1;

        // 5. Clean output structural mapping parameters matching your MFE dashboard specifications
        const formattedShipments = rawShipments.map((shipment: any) => ({
            shipmentId: shipment._id,
            awbNumber: shipment.awbNumber,
            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,
            shipmentType: shipment.shipmentType,
            currentStatus: shipment.currentStatus,
            paymentMode: shipment.paymentMode,
            codAmount: shipment.codAmount,
            expectedDeliveryDate: shipment.expectedDeliveryDate,
            originHub: shipment.originHubId ?? null,
            destinationHub: shipment.destinationHubId ?? null,
            assignedAgent: shipment.currentAgentId ?? null,
            receiverName: shipment.receiver?.name,
            receiverCity: shipment.receiver?.city,
            createdAt: shipment.createdAt,
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
