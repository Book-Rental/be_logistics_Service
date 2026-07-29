import { Schema, model, Document, Types } from "mongoose";

export enum HubStatus {
    ACTIVE = "Active",
    INACTIVE = "Inactive",
}

export interface IHub extends Document {
    hubId: string;
    hubCode: string;
    hubName: string;
    managerName: string;
    email: string;
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
        coordinates: [number, number];
    };

    capacity: number;
    currentLoad: number;
    status: HubStatus;

    createdBy?: Types.ObjectId;
    updatedBy?: Types.ObjectId;

    createdAt: Date;
    updatedAt: Date;
}

const HubSchema = new Schema<IHub>(
    {
        hubId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        hubCode: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },

        hubName: {
            type: String,
            required: true,
            trim: true,
        },

        managerName: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        phoneNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        address: {
            street: {
                type: String,
                required: true,
                trim: true,
            },
            city: {
                type: String,
                required: true,
                trim: true,
            },
            state: {
                type: String,
                required: true,
                trim: true,
            },
            country: {
                type: String,
                default: "India",
                trim: true,
            },
            pincode: {
                type: String,
                required: true,
                trim: true,
            },
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number],
                required: true,
                validate: {
                    validator: (value: number[]) => value.length === 2,
                    message: "Coordinates must contain [longitude, latitude].",
                },
            },
        },

        capacity: {
            type: Number,
            required: true,
            min: 0,
        },

        currentLoad: {
            type: Number,
            default: 0,
            min: 0,
        },

        status: {
            type: String,
            enum: Object.values(HubStatus),
            default: HubStatus.ACTIVE,
        },

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

/* ---------------- Indexes ---------------- */

HubSchema.index({ hubId: 1 });
HubSchema.index({ hubCode: 1 });
HubSchema.index({ email: 1 });
HubSchema.index({ phoneNumber: 1 });
HubSchema.index({ status: 1 });

HubSchema.index({
    hubName: "text",
    managerName: "text",
    email: "text",
});

HubSchema.index({
    location: "2dsphere",
});

export default model<IHub>("Hub", HubSchema);
