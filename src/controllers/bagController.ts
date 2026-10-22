import { Request, Response } from "express";
import { createBag, addShipmentsToBag, updateBagStatus, verifyShipmentInBag, completeBagVerification, verifyScannedShipmentInBag, } from "../services/bagService";
import { BagStatus } from "../models/Bag";
import bag from "../models/Bag";

export const createBagController = async (
    req: Request,
    res: Response
) => {
    try {
        const { fromHubId, toHubId } = req.body;

        if (!fromHubId || !toHubId) {
            return res.status(400).json({
                message: "fromHubId and toHubId are required",
            });
        }

        const bag = await createBag({
            fromHubId,
            toHubId,
        });

        return res.status(201).json({
            message: "Bag created successfully",
            bag,
        });
    } catch (error) {
        console.error("Create bag error:", error);

        return res.status(500).json({
            message: "Failed to create bag",
        });
    }
};

export const addShipmentsToBagController = async (
    req: Request,
    res: Response
) => {
    try {
        const { bagId } = req.params as { bagId: string };
        const { shipmentIds } = req.body;

        if (!shipmentIds || !Array.isArray(shipmentIds)) {
            return res.status(400).json({
                message: "shipmentIds must be an array",
            });
        }

        if (shipmentIds.length === 0) {
            return res.status(400).json({
                message: "At least one shipmentId is required",
            });
        }

        const bag = await addShipmentsToBag(
            bagId,
            shipmentIds
        );

        return res.status(200).json({
            message: "Shipments added to bag successfully",
            bag,
        });
    } catch (error: any) {
        console.error("Add shipments to bag error:", error);

        return res.status(400).json({
            message:
                error.message ||
                "Failed to add shipments to bag",
        });
    }
};

export const updateBagStatusController = async (
    req: Request,
    res: Response
) => {
    try {
        const { bagId } = req.params as { bagId: string };
        const { status, assignedAgentId } = req.body;

        if (!bagId) {
            return res.status(400).json({
                message: "bagId is required",
            });
        }

        if (!status) {
            return res.status(400).json({
                message: "status is required",
            });
        }

        if (!Object.values(BagStatus).includes(status as BagStatus)) {
            return res.status(400).json({
                message: `Invalid bag status: ${status}`,
            });
        }

        if (status === BagStatus.ASSIGNED && !assignedAgentId) {
            return res.status(400).json({
                message: "assignedAgentId is required when assigning the bag",
            });
        }

        const bag = await updateBagStatus(
            bagId,
            status as BagStatus,
            assignedAgentId
        );

        return res.status(200).json({
            message: "Bag status updated successfully",
            bag,
        });
    } catch (error: any) {
        console.error("Update bag status error:", error);

        return res.status(400).json({
            message: error.message || "Failed to update bag status",
        });
    }
};

export const verifyShipmentInBagController = async (
    req: Request,
    res: Response
) => {
    try {
        const { bagId, shipmentId } = req.body;

        if (!bagId || !shipmentId) {
            return res.status(400).json({
                message: "bagId and shipmentId are required",
            });
        }

        const bag = await verifyShipmentInBag(
            bagId,
            shipmentId
        );

        return res.status(200).json({
            message: "Shipment verified successfully",
            bag,
        });
    } catch (error: any) {
        return res.status(400).json({
            message: error.message,
        });
    }
};

export const completeBagVerificationController = async (
    req: Request,
    res: Response
) => {
    try {
        const { bagId } = req.body;

        if (!bagId) {
            return res.status(400).json({
                message: "bagId is required",
            }); 
        }

        const bag = await completeBagVerification(bagId);

        return res.status(200).json({
            message: "Bag verification completed successfully",
            bag,
        });
    } catch (error: any) {
        return res.status(400).json({
            message: error.message,
        });
    }
};

export const verifyScannedShipmentInBagController = async (
    req: Request,
    res: Response
) => {
    try {
        const { bagId } = req.params as { bagId: string };
        const { awbNumber } = req.body;

        if (!bagId || !awbNumber) {
            return res.status(400).json({
                message: "bagId and awbNumber are required",
            });
        }

        const result = await verifyScannedShipmentInBag(
            bagId,
            awbNumber
        );

        return res.status(200).json({
            message: "Scanned shipment verified successfully",
            data: result,
        });
    } catch (error: any) {
        return res.status(400).json({
            message: error.message || "Failed to verify scanned shipment",
        });
    }
};

// Get all bags
export const getAllBags = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const bags = await bag.find({}).sort({ createdAt: -1 });

    res.status(200).json({
      status: "Success",
      message: "Bags fetched successfully",
      data: bags,
    });
  } catch (error: any) {
    console.error("Error fetching bags:", error);

    res.status(500).json({
      status: "Failed",
      message: "Failed to fetch bags",
      error: error.message,
    });
  }
};

// Get bag by custom bagId, not MongoDB _id
export const getBagById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { bagId } = req.params;

    const bagData = await bag.findOne({ bagId });

    if (!bagData) {
      res.status(404).json({
        status: "Failed",
        message: "Bag not found",
      });
      return;
    }

    res.status(200).json({
      status: "Success",
      message: "Bag fetched successfully",
      data: bagData,
    });
  } catch (error: any) {
    console.error("Error fetching bag:", error);

    res.status(500).json({
      status: "Failed",
      message: "Failed to fetch bag",
      error: error.message,
    });
  }
};
