import { Schema, model, Types, Document } from "mongoose";

export enum ShipmentType {
    FORWARD = "Forward",
    RETURN = "Return",
    EXCHANGE = "Exchange",
}

export enum PaymentMode {
    PREPAID = "Prepaid",
    COD = "COD",
}

export enum ShipmentStatus {
    CREATED = "Created",

    READY_FOR_PICKUP = "Ready For Pickup",

    PICKUP_ASSIGNED = "Pickup Assigned",

    OUT_FOR_PICKUP = "Out For Pickup",

    PICKUP_COMPLETED = "Pickup Completed",

    ARRIVED_AT_ORIGIN_HUB = "Arrived At Origin Hub",

    SORTING_COMPLETED = "Sorting Completed",

    IN_TRANSIT = "In Transit",

    ARRIVED_AT_DESTINATION_HUB = "Arrived At Destination Hub",

    DELIVERY_AGENT_ASSIGNED = "Delivery Agent Assigned",

    OUT_FOR_DELIVERY = "Out For Delivery",

    DELIVERED = "Delivered",

    DELIVERY_FAILED = "Delivery Failed",

    RETURN_INITIATED = "Return Initiated",

    RETURNED = "Returned",

    CANCELLED = "Cancelled",
}

export enum JourneyEventType {
    SHIPMENT_CREATED = "Shipment Created",

    READY_FOR_PICKUP = "Ready For Pickup",

    PICKUP_AGENT_ASSIGNED = "Pickup Agent Assigned",

    OUT_FOR_PICKUP = "Out For Pickup",

    PICKUP_COMPLETED = "Pickup Completed",

    ARRIVED_AT_HUB = "Arrived At Hub",

    SORTING_COMPLETED = "Sorting Completed",

    ADDED_TO_TRIP = "Added To Trip",

    REMOVED_FROM_TRIP = "Removed From Trip",

    TRIP_STARTED = "Trip Started",

    TRIP_COMPLETED = "Trip Completed",

    DELIVERY_AGENT_ASSIGNED = "Delivery Agent Assigned",

    OUT_FOR_DELIVERY = "Out For Delivery",

    DELIVERY_ATTEMPTED = "Delivery Attempted",

    DELIVERED = "Delivered",

    RETURN_INITIATED = "Return Initiated",

    RETURNED = "Returned",

    CANCELLED = "Cancelled",
}

const ContactSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        phone: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
        },

        addressLine1: {
            type: String,
            required: true,
            trim: true,
        },

        addressLine2: {
            type: String,
            default: "",
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

        pincode: {
            type: String,
            required: true,
            trim: true,
        },

        country: {
            type: String,
            default: "India",
            trim: true,
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
    },
    {
        _id: false,
    }
);

const JourneyDetailSchema = new Schema(
    {
        event: {
            type: String,
            enum: Object.values(JourneyEventType),
            required: true,
        },

        status: {
            type: String,
            enum: Object.values(ShipmentStatus),
            required: true,
        },

        hubId: {
            type: Schema.Types.ObjectId,
            ref: "Hub",
            default: null,
        },

        tripId: {
            type: Schema.Types.ObjectId,
            ref: "Trip",
            default: null,
        },

        agentId: {
            type: Schema.Types.ObjectId,
            ref: "Agent",
            default: null,
        },

        remarks: {
            type: String,
            default: "",
        },

        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "LogisticsAuth",
            default: null,
        },

        eventAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        _id: true,
    }
);
export enum JourneyType {
    PICKUP = "Pickup",
    DELIVERY = "Delivery",
    RETURN = "Return",
}
export interface IShipment extends Document {
    shipmentId: string;

    awbNumber: string;

    orderId: string;

    orderItemId: Types.ObjectId;

    sellerId: Types.ObjectId;

    buyerId: Types.ObjectId;

    sender: any;

    receiver: any;

    shipmentType: ShipmentType;

    paymentMode: PaymentMode;

    codAmount?: number;

    originHubId: Types.ObjectId;

    destinationHubId: Types.ObjectId;

    currentHubId?: Types.ObjectId;

    currentAgentId?: Types.ObjectId | null;

    currentTripId?: Types.ObjectId;

    currentStatus: ShipmentStatus;

    expectedDeliveryDate?: Date;

    actualDeliveryDate?: Date;

    journeyDetails: any[];

    createdBy?: Types.ObjectId;

    updatedBy?: Types.ObjectId;

    hubIds: Types.ObjectId[];

    journeyType: JourneyType;

    agentIds: Types.ObjectId[];
}

const ShipmentSchema = new Schema<IShipment>(
    {
        awbNumber: {
            type: String,
            required: true,
            unique: true,
        },

        orderId: {
            type: String,
            required: true,
            index: true,
        },

        orderItemId: {
            type: Schema.Types.ObjectId,
            required: true,
        },

        sellerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        buyerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        sender: ContactSchema,

        receiver: ContactSchema,

        shipmentType: {
            type: String,
            enum: Object.values(ShipmentType),
            default: ShipmentType.FORWARD,
        },

        paymentMode: {
            type: String,
            enum: Object.values(PaymentMode),
            default: PaymentMode.PREPAID,
        },

        codAmount: {
            type: Number,
            default: 0,
        },

        originHubId: {
            type: Schema.Types.ObjectId,
            ref: "Hub",
            required: true,
        },

        destinationHubId: {
            type: Schema.Types.ObjectId,
            ref: "Hub",
            required: true,
        },

        currentHubId: {
            type: Schema.Types.ObjectId,
            ref: "Hub",
            default: null,
        },

        currentAgentId: {
            type: Schema.Types.ObjectId,
            ref: "Agent",
            default: null,
        },

        currentTripId: {
            type: Schema.Types.ObjectId,
            ref: "Trip",
            default: null,
        },

        currentStatus: {
            type: String,
            enum: Object.values(ShipmentStatus),
            default: ShipmentStatus.CREATED,
        },

        expectedDeliveryDate: Date,

        actualDeliveryDate: Date,

        journeyDetails: {
            // cast to any to satisfy TypeScript typings for Schema array of subdocuments
            type: [JourneyDetailSchema] as any,
            default: [],
        },

        hubIds: {
            type: [Schema.Types.ObjectId],
            ref: "Hub",
            default: [],
        },
        agentIds: {
            type: [Schema.Types.ObjectId],
            ref: "Agent",
            default: [],
        },
        journeyType: {
            type: String,
            enum: Object.values(JourneyType),
            default: JourneyType.PICKUP,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "LogisticsAuth",
        },

        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "LogisticsAuth",
        },
    },
    {
        timestamps: true,
    }
);

// ======================
// Indexes
// ======================

// Unique Tracking Number
ShipmentSchema.index({ awbNumber: 1 }, { unique: true });

// Order
ShipmentSchema.index({ orderId: 1 });
ShipmentSchema.index({ orderItemId: 1 }, { unique: true });

// Users
ShipmentSchema.index({ sellerId: 1 });
ShipmentSchema.index({ buyerId: 1 });

// Shipment Status
ShipmentSchema.index({ currentStatus: 1 });

// Hub Queries
ShipmentSchema.index({ originHubId: 1 });
ShipmentSchema.index({ destinationHubId: 1 });
ShipmentSchema.index({ currentHubId: 1 });
ShipmentSchema.index({ hubIds: 1 });

// Agent Queries
ShipmentSchema.index({ currentAgentId: 1 });

// Trip Queries
ShipmentSchema.index({ currentTripId: 1 });

// Common Dashboard Query
ShipmentSchema.index({
    currentStatus: 1,
    currentHubId: 1,
});

// Pickup Agent Dashboard
ShipmentSchema.index({
    currentAgentId: 1,
    journeyType: 1,
    currentStatus: 1,
});

// Delivery Agent Dashboard
ShipmentSchema.index({
    currentAgentId: 1,
    journeyType: 1,
});

// Shipment Timeline
ShipmentSchema.index({
    createdAt: -1,
});

// Geo Queries (Optional)
ShipmentSchema.index({
    "sender.location": "2dsphere",
});

ShipmentSchema.index({
    "receiver.location": "2dsphere",
});

// ======================
// Export
// ======================

export default model<IShipment>("Shipment", ShipmentSchema);
