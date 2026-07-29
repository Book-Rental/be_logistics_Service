import Hub from "../models/hub";
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
        location,
        capacity,
        createdBy,
    } = payload;

    const normalizedEmail = email.toLowerCase();
    const session = await mongoose.startSession();

    try {
        let hub: any;

        await session.withTransaction(async () => {
            const existingPhone = await Hub.findOne({ phoneNumber }).session(session);
            if (existingPhone) {
                throw new Error("Phone number already exists");
            }

            const existingEmail = await Hub.findOne({ email: normalizedEmail }).session(session);
            if (existingEmail) {
                throw new Error("Email already exists");
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
                        location,
                        capacity,
                        createdBy,
                    },
                ],
                { session }
            );

            // Create Login User inside the same transaction, so a failure
            // here rolls back the Hub creation too - no more orphaned Hubs
            const logisticsUser = await createLogisticsUserService({
                email: normalizedEmail,
                password,
                role: LogisticsRole.HUB_MANAGER,
                referenceId: hub._id.toString(),
                createdBy,
                session,
            });

            // Link the Hub back to its login record
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
