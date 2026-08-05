import axios from "axios";

export const getOrderItemDetails = async (orderId: string, ItemId: string) => {
    try {
        const response = await axios.get(
            `${process.env.ORDER_SERVICE_URL}/api/order/${orderId}/Item/${ItemId}`
        );

        return response.data.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || "Failed to fetch order details.");
    }
};

export const updateOrderItemStatuse = async (orderId: string, ItemId: string, status: string) => {
    try {
        const response = await axios.put(
            `${process.env.ORDER_SERVICE_URL}/api/order/update/${orderId}`,
            {
                items: {
                    _id: ItemId,
                    itemStatus: status,
                },
            }
        );
        return response.data.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || "Failed to update order item status.");
    }
};
