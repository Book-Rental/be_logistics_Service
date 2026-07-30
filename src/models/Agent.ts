import { model, Schema, Types, Document } from "mongoose";

export enum VehicleType {
    BIKE = "Bike",
    SCOOTER = "Scooter",
    CAR = "Car",
}

export enum AgentStatus {
    ACTIVE = "Active",
    ON_DELIVERY = "OnDelivery",
    INACTIVE = "Inactive",
    OFF_DUTY = "Off Duty",
}

export interface IAgent extends Document {
    logisticsAuthId: Types.ObjectId; // 🚀 Added to bridge with authentication service
    agentId: string;
    hubId: Types.ObjectId;
    fullName: string;
    email: string;
    phoneNumber: string;
    vehicleType: VehicleType;
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
    status: AgentStatus;
    isActive: boolean;
    joinedOn: Date;
    createdBy?: Types.ObjectId;
    updatedBy?: Types.ObjectId;
}

const AgentSchema = new Schema<IAgent>(
    {
        hubId: {
            type: Schema.Types.ObjectId,
            ref: "Hub",
            required: true,
            index: true,
        },

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

        vehicleType: {
            type: String,
            enum: Object.values(VehicleType),
            required: true,
        },

        vehicleNumber: {
            type: String,
            trim: true,
            default: "",
        },

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

        currentShipmentId: {
            type: Schema.Types.ObjectId,
            ref: "Shipment",
            default: null,
        },

        isAvailable: {
            type: Boolean,
            default: true,
        },

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

        status: {
            type: String,
            enum: Object.values(AgentStatus),
            default: AgentStatus.ACTIVE,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        joinedOn: {
            type: Date,
            default: Date.now,
        },

        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },

        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);

AgentSchema.index({ hubId: 1 });
AgentSchema.index({ email: 1 });
AgentSchema.index({ phoneNumber: 1 });
AgentSchema.index({ status: 1 });
AgentSchema.index({ isActive: 1 });
AgentSchema.index({ isAvailable: 1 });
AgentSchema.index({ currentShipmentId: 1 });

AgentSchema.index({
    fullName: "text",
    email: "text",
    phoneNumber: "text",
});

AgentSchema.index({ currentLocation: "2dsphere" });

export default model<IAgent>("Agent", AgentSchema);
