import { Schema, model, Document, Types } from "mongoose";

export enum LogisticsRole {
    ADMIN = "ADMIN",
    HUB_MANAGER = "HUB_MANAGER",
    AGENT = "AGENT",
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
    referenceId: Types.ObjectId;
    isActive: boolean;
    status: LogisticsUserStatus;
    lastLogin?: Date;
    createdBy?: Types.ObjectId;
    updatedBy?: Types.ObjectId;
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
        },

        // _id of Admin / Hub / Agent
        referenceId: {
            type: Schema.Types.ObjectId,
            required: true,
        },

        status: {
            type: String,
            enum: Object.values(LogisticsUserStatus),
            default: LogisticsUserStatus.ACTIVE,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        lastLogin: {
            type: Date,
            default: null,
        },

        createdBy: {
            type: Types.ObjectId,
            ref: "LogisticsAuth",
            default: null,
        },

        updatedBy: {
            type: Types.ObjectId,
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

LogisticsAuthSchema.index({ role: 1 });

LogisticsAuthSchema.index({ referenceId: 1 });

LogisticsAuthSchema.index({ status: 1 });

export default model<ILogisticsAuth>("LogisticsAuth", LogisticsAuthSchema);
