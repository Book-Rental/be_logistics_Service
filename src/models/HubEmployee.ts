import { Document, model, Schema, Types } from "mongoose";

export enum EmployeeRole {
    MANAGER = "MANAGER",
    CASHIER = "CASHIER",
    TEAM_LEAD = "TEAM_LEAD",
    AGENT = "AGENT",
}

export enum EmployeeStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
}

export interface IHubEmployee extends Document {
    hubId: Types.ObjectId;
    employeeId: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    role: EmployeeRole;
    address?: string;
    photo?: string | null;
    status: EmployeeStatus;
    joinedOn: Date;
    createdBy?: Types.ObjectId;
    updatedBy?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HubEmployeeSchema = new Schema<IHubEmployee>(
    {
        hubId: {
            type: Schema.Types.ObjectId,
            ref: "Hub",
            required: true,
            index: true,
        },
        employeeId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            lowercase: true,
        },
        phoneNumber: {
            type: String,
            required: true,
            trim: true,
        },
        role: {
            type: String,
            enum: Object.values(EmployeeRole),
            required: true,
        },
        address: {
            type: String,
            trim: true,
            default: "",
        },
        photo: {
            type: String,
            default: null,
        },
        status: {
            type: String,
            enum: Object.values(EmployeeStatus),
            default: EmployeeStatus.ACTIVE,
        },
        joinedOn: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);
HubEmployeeSchema.index({ hubId: 1 });
HubEmployeeSchema.index({ role: 1 });
HubEmployeeSchema.index({ status: 1 });

export default model<IHubEmployee>("HubEmployee", HubEmployeeSchema);
