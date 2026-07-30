import Hub, { HubStatus } from "../models/hub";
import { createLogisticsUserService } from "./authService";
import { LogisticsRole } from "../models/LogisticsAuth";
import { generateHubDetails } from "../utils/generateHubDetails";
import mongoose from "mongoose";

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
