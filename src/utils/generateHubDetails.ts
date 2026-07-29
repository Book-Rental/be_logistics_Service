import hub from "../models/hub";

export const generateHubDetails = async () => {
    const lastHub = await hub.findOne().sort({ createdAt: -1 }).select("hubId hubCode");

    if (!lastHub) {
        return {
            hubId: "HUB000001",
            hubCode: "HUB001",
        };
    }

    const lastNumber = parseInt(lastHub.hubId.replace("HUB", ""), 10);
    const nextNumber = lastNumber + 1;

    return {
        hubId: `HUB${String(nextNumber).padStart(6, "0")}`,
        hubCode: `HUB${String(nextNumber).padStart(3, "0")}`,
    };
};
