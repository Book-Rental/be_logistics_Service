import { Request, Response } from "express";
import { getHubEmployeesService } from "../services/hubEmployeeService";
import { failResponse, successResponse } from "../utils/response";
import { StatusCode } from "../utils/StatusCodes";

export const getHubEmployees = async (req: Request, res: Response) => {
    try {
        const hubId = req.params.id as string;
        if (!hubId) {
            return failResponse(
                res,
                "hubId parameter is required",
                StatusCode.Bad_Request
            );
        }

        const data = await getHubEmployeesService(hubId);

        return successResponse(
            res,
            data,

            "Hub employees fetched successfully.",
            StatusCode.OK
        );
    } catch (error: any) {
        return failResponse(
            res,
            error.message,
            error.statusCode || StatusCode.Internal_Server_Error
        );
    }
}