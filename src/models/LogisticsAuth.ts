import { Schema, model, Document, Types } from "mongoose";

export enum LogisticsRole {
    ADMIN = "ADMIN",
    HUB_MANAGER = "HUB_MANAGER",
    HUB_TL = "HUB_TL",
    AGENT = "AGENT",
    CASHIER = "CASHIER",
}

export enum LogisticsUserStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    BLOCKED = "BLOCKED",
}

export interface ILogisticsAuth extends Document {
    email: string;
    password: string;
    role: LogisticsRole;

    /**
     * Reference ID:
     *
     * ADMIN       -> Admin._id
     * HUB_MANAGER -> HubEmployee._id
     * HUB_TL      -> HubEmployee._id
     * AGENT       -> HubEmployee._id
     */
    referenceId: Types.ObjectId;

    isActive: boolean;
    status: LogisticsUserStatus;

    lastLogin?: Date | null;

    createdBy?: Types.ObjectId | null;
    updatedBy?: Types.ObjectId | null;

    createdAt: Date;
    updatedAt: Date;
}

const LogisticsAuthSchema = new Schema<ILogisticsAuth>(
    {
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"],
        },

        password: {
            type: String,
            required: [true, "Password is required"],
        },

        role: {
            type: String,
            enum: Object.values(LogisticsRole),
            required: true,
            index: true,
        },

        referenceId: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: Object.values(LogisticsUserStatus),
            default: LogisticsUserStatus.ACTIVE,
            index: true,
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        lastLogin: {
            type: Date,
            default: null,
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

LogisticsAuthSchema.index({ email: 1 }, { unique: true });

LogisticsAuthSchema.index({
    role: 1,
});

LogisticsAuthSchema.index({
    referenceId: 1,
});

LogisticsAuthSchema.index({
    role: 1,
    referenceId: 1,
});

LogisticsAuthSchema.index({
    status: 1,
});

LogisticsAuthSchema.index({
    isActive: 1,
});

export default model<ILogisticsAuth>("LogisticsAuth", LogisticsAuthSchema);
