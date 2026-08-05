export const JWT_TOKEN_NAME = "Authorization";
export const GUEST_COOKIE_NAME = "guest";

export const Messages = {
    // =========================
    // Common
    // =========================
    Success: "Success",
    Fail: "Fail",
    Something_went_Wrong: "Something went wrong!",
    Unexpected_Error: "An unexpected error occurred",
    Internal_Server_Error: "Internal Server Error",

    // =========================
    // Authentication
    // =========================
    Unauthorized_User: "Unauthorized",
    Not_Authorized_No_Token: "Not authorized, no token",
    Invalid_Token: "Invalid token.",
    Token_Expired: "Token expired. Please log in again.",
    Token_Expired_Error: "TokenExpiredError",
    UserAuthenticated: "User Authenticated successfully!",
    Logout: "Logged out successfully",

    // =========================
    // User
    // =========================
    User_Created: "User Created successfully!",
    User_Updated: "User Updated successfully!",
    User_Deleted: "User Deleted successfully!",
    User_Not_Available: "User Not Available",
    User_Id_Required: "userId is required",
    Duplicate_Email: "Duplicate Email",
    Fetch_Error: "Error fetching users",
    Password_Not_Matched: "Invalid Password ",
    Password_Updated: "Password updated successfully!",
    CurrentPassword_NotCorrect: "Current Password not correct!",

    //Agent Related Message
    AGENT_CREATED_SUCCESSFULLY: "Agent Created successfully",
    AGENT_FETCHED_SUCCESSFULLY: "Agent Fetched successfully",
    AGENTID_REQUIRED: "Agent Id is Required ",

    //HUb Related Messages

    HUB_FETECHED_SUCCESSFULLY: "HUb fetched successfully",

    SHIPMENT_CREATED_SUCCESSFULLY: "ShipMent Created successfully",
    SHIPMENT_FETCHED_SUCCESSFULLY: "Shipment Fetched successfully",
};

export const EmailSubjects = {
    Welcome: "Welcome to techdenali",
    ChangePassword: "Change Password",
    ForgotPassword: "ForgotPassword",
    Default: "From Techdenali",
};

export const RegimenInfromation = {
    cleanse: "Cleanse",
    currect: "Currect",
    hydrate: "Hydrate",
    protect: "Protect",
};

export const ProductTypes = {
    retail: "Retail",
    backbar: "Backbar",
    sample: "Sample",
};

export const PaymentMethod = {
    Credit_Card: "Credit Card",
    PayPal: "PayPal",
    COD: "COD",
};

export const orderAllowedUpdates = [
    "orderStatus",
    "shippingAddress",
    "billingAddress",
    "paymentStatus",
    "estimatedDelivery",
    "isActive",
    "comments",
];

export const UserAddressFields = [
    "name",
    "street",
    "city",
    "state",
    "zipCode",
    "country",
    "phone",
    "id",
];
