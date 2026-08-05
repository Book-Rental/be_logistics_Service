import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { failResponse } from "../utils/response";
import { JWT_TOKEN_NAME, Messages } from "../utils/constants";

export interface AuthRequest extends Request {
    user?: string | object;
    isInternalService?: boolean; // 🚀 Flag to identify trusted backend requests
}

// Middleware to protect routes (Supports both Users and Internal Microservices)
export const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 1. Check for Server-to-Server (S2S) Microservice Communication Header
    const internalServiceToken = req.headers["x-internal-service-token"];
    const systemSecret = process.env.INTERNAL_SERVICE_SECRET;

    if (systemSecret && internalServiceToken === systemSecret) {
        // 🚀 Trusted internal call detected. Attach a system scope and proceed instantly.
        req.user = { id: "system-agent", role: "internal_microservice" };
        req.isInternalService = true;
        return next();
    }

    // 2. Fall back to standard User Cookie Token validation if no microservice header exists
    let token: string | undefined = req.cookies[`${JWT_TOKEN_NAME}`];

    if (token) {
        try {
            const decoded = await verifyToken(token);
            // Attach user to the request object for your protected routes
            req.user = decoded;
            return next();
        } catch (err: any) {
            console.error("Authentication Token Error:", err.message);

            if (err.name === Messages.Token_Expired_Error) {
                return failResponse(res, Messages.Token_Expired, 401);
            }
            return failResponse(res, Messages.Invalid_Token, 401);
        }
    }

    // 3. Reject the request if both validation pathways fail
    return failResponse(res, Messages.Not_Authorized_No_Token, 401);
};
