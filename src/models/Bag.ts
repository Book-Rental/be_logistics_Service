import mongoose, { Document, Schema } from "mongoose";

export enum BagStatus {
    CREATED = "CREATED",
    SEALED = "SEALED",
    ASSIGNED = "ASSIGNED",
    IN_TRANSIT = "IN_TRANSIT",
    ARRIVED = "ARRIVED",
    RECEIVED = "RECEIVED",
    OPENED = "OPENED",
    VERIFIED = "VERIFIED",
    RELEASED = "RELEASED",
}

export interface IBag extends Document {
    bagId: string;
    fromHubId: string;
    toHubId: string;
    shipmentIds: mongoose.Types.ObjectId[];
    verifiedShipmentIds: mongoose.Types.ObjectId[];
    status: BagStatus;
    assignedAgentId?: mongoose.Types.ObjectId;
    sealedAt?: Date;
    dispatchedAt?: Date;
    arrivedAt?: Date;
    receivedAt?: Date;
    releasedAt?: Date;
}

const BagSchema = new Schema<IBag>(
    {
        bagId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        fromHubId: {
            type: String,
            required: true,
            index: true,
        },

        toHubId: {
            type: String,
            required: true,
            index: true,
        },

        shipmentIds: [
            {
                type: Schema.Types.ObjectId,
                ref: "Shipment",
            },
        ],

        verifiedShipmentIds: [
            {
                type: Schema.Types.ObjectId,
                ref: "Shipment",
            },
        ],

        status: {
            type: String,
            enum: Object.values(BagStatus),
            default: BagStatus.CREATED,
        },

        assignedAgentId: {
            type: Schema.Types.ObjectId,
            ref: "Agent",
        },

        sealedAt: Date,
        dispatchedAt: Date,
        arrivedAt: Date,
        receivedAt: Date,
        releasedAt: Date,
    },
    {
        timestamps: true,
    }
);

export default mongoose.model<IBag>("Bag", BagSchema);