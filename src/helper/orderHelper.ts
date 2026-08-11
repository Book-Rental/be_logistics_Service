import axios from "axios";

// 🚀 Helper to construct standard headers with the secret token for internal service authorization
const getInternalHeaders = () => ({
    "Content-Type": "application/json",
    "x-internal-service-token": process.env.INTERNAL_SERVICE_SECRET || "",
});

export const getOrderItemDetails = async (orderId: string, itemId: string) => {
    try {
        const response = await axios.get(
            `${process.env.ORDER_SERVICE_URL}/api/order/${orderId}/Item/${itemId}`,
            {
                headers: getInternalHeaders(), // 🚀 Fixed Authorization block injection
            }
        );

        return response.data?.data || response.data;
    } catch (error: any) {
        console.error(
            `Failed to fetch order details for Order: ${orderId}, Item: ${itemId}`,
            error.message
        );
        throw new Error(error.response?.data?.message || "Failed to fetch order details.");
    }
};

export const updateOrderItemStatus = async (orderId: string, itemId: string, status: string) => {
    try {
        // 1. Structure payload with an array to match target specifications exactly
        const payload = {
            items: [
                {
                    _id: itemId,
                    itemStatus: status,
                },
            ],
        };

        // 2. Fire the synchronous PUT network request with internal auth headers
        const response = await axios.put(
            `${process.env.ORDER_SERVICE_URL}/api/order/update/${orderId}`,
            payload,
            {
                headers: getInternalHeaders(), // 🚀 Fixed Authorization block injection
            }
        );

        // Return data block directly matching standard response definitions
        return response.data?.data || response.data;
    } catch (error: any) {
        // Log original trace internally for engineering debugging diagnostics
        console.error(
            `Order service communication failure for Order: ${orderId}, Item: ${itemId}`,
            error.message
        );

        throw new Error(error.response?.data?.message || "Failed to update order item status.");
    }
};
