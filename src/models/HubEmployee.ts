import { Schema, model, Document, Types } from "mongoose";

export enum HubEmployeeRole {
    HUB_MANAGER = "HUB_MANAGER",
    TL = "tl",
    AGENT = "agent",
    CASHIER = "cashier",
}

export enum VehicleType {
    BIKE = "Bike",
    SCOOTER = "Scooter",
    CAR = "Car",
}

export enum HubEmployeeStatus {
    ACTIVE = "Active",
    ON_DELIVERY = "OnDelivery",
    INACTIVE = "Inactive",
    OFF_DUTY = "Off Duty",
}

export interface IHubEmployee extends Document {
    employeeId: string;

    logisticsAuthId?: Types.ObjectId;

    hubId: Types.ObjectId;

    fullName: string;

    email: string;

    phoneNumber: string;

    role: HubEmployeeRole;

    vehicleType?: string;

    vehicleNumber?: string;

    address?: string;

    emergencyContact?: string;

    notes?: string;

    photo?: string | null;

    currentShipmentId?: Types.ObjectId | null;

    isAvailable: boolean;

    currentLocation?: {
        type: string;
        coordinates: number[];
        updatedAt?: Date | null;
    };

    status: HubEmployeeStatus;

    isActive: boolean;

    joinedOn: Date;

    createdBy?: Types.ObjectId;

    updatedBy?: Types.ObjectId;

    createdAt: Date;

    updatedAt: Date;
}

const HubEmployeeSchema =
    new Schema<IHubEmployee>(
        {
            // =================================================
            // Employee ID
            // =================================================

            employeeId: {
                type: String,
                required: true,
                unique: true,
                trim: true,
                index: true,
            },

            // =================================================
            // Logistics Auth
            // =================================================

            logisticsAuthId: {
                type: Schema.Types.ObjectId,
                ref: "LogisticsAuth",
                default: null,
            },

            // =================================================
            // Hub
            // =================================================

            hubId: {
                type: Schema.Types.ObjectId,
                ref: "Hub",
                required: true,
                index: true,
            },

            // =================================================
            // Employee Details
            // =================================================

            fullName: {
                type: String,
                required: true,
                trim: true,
            },

            email: {
                type: String,
                required: true,
                unique: true,
                trim: true,
                lowercase: true,
            },

            phoneNumber: {
                type: String,
                required: true,
                unique: true,
                trim: true,
            },

            // =================================================
            // Role
            // =================================================

            role: {
                type: String,
                enum: Object.values(
                    HubEmployeeRole
                ),
                required: true,
            },

            // =================================================
            // Vehicle
            // =================================================

            vehicleType: {
                type: String,
                default: null,
            },

            vehicleNumber: {
                type: String,
                trim: true,
                default: "",
            },

            // =================================================
            // Other Details
            // =================================================

            address: {
                type: String,
                trim: true,
                default: "",
            },

            emergencyContact: {
                type: String,
                trim: true,
                default: "",
            },

            notes: {
                type: String,
                trim: true,
                default: "",
            },

            photo: {
                type: String,
                default: null,
            },

            // =================================================
            // Current Shipment
            // =================================================

            currentShipmentId: {
                type: Schema.Types.ObjectId,
                ref: "Shipment",
                default: null,
            },

            // =================================================
            // Availability
            // =================================================

            isAvailable: {
                type: Boolean,
                default: true,
            },

            // =================================================
            // Location
            // =================================================

            currentLocation: {
                type: {
                    type: String,
                    enum: ["Point"],
                    default: "Point",
                },

                coordinates: {
                    type: [Number],
                    default: [0, 0],
                },

                updatedAt: {
                    type: Date,
                    default: null,
                },
            },

            // =================================================
            // Status
            // =================================================

            status: {
                type: String,
                enum: Object.values(
                    HubEmployeeStatus
                ),
                default:
                    HubEmployeeStatus.ACTIVE,
            },

            // =================================================
            // Active
            // =================================================

            isActive: {
                type: Boolean,
                default: true,
            },

            // =================================================
            // Joined Date
            // =================================================

            joinedOn: {
                type: Date,
                default: Date.now,
            },

            // =================================================
            // Audit
            // =================================================

            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "LogisticsAuth",
                default: null,
            },

            updatedBy: {
                type: Schema.Types.ObjectId,
                ref: "LogisticsAuth",
                default: null,
            },
        },
        {
            timestamps: true,
        }
    );

// =====================================================
// Indexes
// =====================================================

HubEmployeeSchema.index(
    { employeeId: 1 },
    { unique: true }
);

HubEmployeeSchema.index({
    hubId: 1,
});

HubEmployeeSchema.index({
    email: 1,
});

HubEmployeeSchema.index({
    phoneNumber: 1,
});

HubEmployeeSchema.index({
    role: 1,
});

HubEmployeeSchema.index({
    status: 1,
});

HubEmployeeSchema.index({
    isActive: 1,
});

HubEmployeeSchema.index({
    isAvailable: 1,
});

HubEmployeeSchema.index({
    currentShipmentId: 1,
});

HubEmployeeSchema.index({
    currentLocation: "2dsphere",
});

HubEmployeeSchema.index({
    fullName: "text",
    employeeId: "text",
    email: "text",
    phoneNumber: "text",
});

export default model<IHubEmployee>(
    "HubEmployee",
    HubEmployeeSchema
);
