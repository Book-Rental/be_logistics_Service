import {
    createHubEmployeeService,

    getAllEmployeesService,
    getEmployeeByHubIdService,
    getEmployeeByIdService,
} from "../services/employeeService";
import { failResponse, successResponse } from "../utils/response";
import { StatusCode } from "../utils/StatusCodes";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import { Request, Response } from "express";

export const createHubEmployee = async (req: Request, res: Response) => {
    try {
        const file = req.file;

        let photo: string | undefined;

        if (file) {
            photo = await uploadToCloudinary(
                file.buffer,
                "book-rental/managers",
                `manager-${Date.now()}`
            );
        }

        const manager = await createHubEmployeeService({
            ...req.body,
            photo
        });

        return res.status(201).json({
            success: true,
            message: "Employee created successfully ",
            data: manager,
        });
    } catch (error: any) {
        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || "Failed to create manager",
        });
    }
};

export const getAllEmployees = async (req: Request, res: Response) => {
    try {
        const { employeeStatus, role, search, page, limit } = req.query;

        const result = await getAllEmployeesService({
            employeeStatus: employeeStatus as string | undefined,
            role: role as string | undefined,
            search: search as string | undefined,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });

        return res.status(200).json({
            success: true,
            message: "Employees fetched successfully",
            result,
        });
    } catch (error: any) {
        failResponse(res, error?.message || error, StatusCode.Bad_Request);
    }
};

export const getEmployeeById = async (req: Request, res: Response) => {
    try {
        const employeeId = req.params.employeeId as string;

        if (!employeeId) {
            return failResponse(res, "employeeId is required.", StatusCode.Bad_Request);
        }

        const employee = await getEmployeeByIdService(employeeId);

        if (!employee) {
            return failResponse(res, "Employee not found.", StatusCode.Not_Found);
        }

        return successResponse(res, employee, "Employee fetched successfully.", StatusCode.OK);
    } catch (error: any) {
        failResponse(res, error?.message || error, StatusCode.Bad_Request);
    }
};

export const getEmployeeByHubId = async (req: Request, res: Response) => {
    try {
        const hubId = req.params.hubId as string;

        if (!hubId) {
            return failResponse(res, "hubId is required.", StatusCode.Bad_Request);
        }

        const employee = await getEmployeeByHubIdService(hubId);

        if (!employee) {
            return failResponse(res, "Employee not found.", StatusCode.Not_Found);
        }

        return successResponse(res, employee, "Employee fetched successfully.", StatusCode.OK);
    } catch (error: any) {
        failResponse(res, error?.message || error, StatusCode.Bad_Request);
    }
};
