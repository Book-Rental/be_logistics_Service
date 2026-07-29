import { Response } from "express";
import { Messages } from "./constants";

// Success response format
export const successResponse = (
    res: Response,
    data: any,
    message = Messages.Success,
    statusCode = 200
) => {
    return res.status(statusCode).json({
        status: Messages.Success,
        message,
        data,
    });
};

// Failure response format (for client-side errors)
export const failResponse = (
    res: Response,
    message: string | any = Messages.Fail,
    statusCode = 400
) => {
    return res.status(statusCode).json({
        status: Messages.Fail,
        message,
    });
};

// Error response format (for server-side errors)
export const errorResponse = (
    res: Response,
    message = Messages.Internal_Server_Error,
    statusCode = 500,
    error = null
) => {
    return res.status(statusCode).json({
        status: Messages.Internal_Server_Error,
        message,
        error,
    });
};
