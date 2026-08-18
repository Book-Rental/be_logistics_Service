import mongoose from "mongoose";
import Hub, { HubStatus } from "../models/hub";
import { LogisticsRole } from "../models/LogisticsAuth";
import { createLogisticsUserService } from "./authService";
import { HubEmployeeRole, HubEmployeeStatus } from "../models/HubEmployee";
import { buildPaginationQuery } from "../utils/paginationHelper";
import { StatusCode } from "../utils/StatusCodes";
import { generateEmployeeId } from "../utils/shipment";
import HubEmployee from "../models/HubEmployee";

interface CreateManagerPayload {
    hubId: string;
    fullName: string;
    email: string;
    password: string;
    phoneNumber: string;
    address: string;
    emergencyContact: string;
    notes?: string;
    photo?: string;
    createdBy: string;
    isActive?: boolean;
    role: HubEmployeeRole
}

export const createHubEmployeeService = async (
    payload: CreateManagerPayload
) => {
    const {
        hubId,
        fullName,
        email,
        password,
        phoneNumber,
        address,
        emergencyContact,
        notes,
        photo,
        createdBy,
        isActive = true,
        role,
    } = payload;

    const normalizedEmail = email.toLowerCase().trim();

    const session = await mongoose.startSession();

    try {
        let hubEmployee: any;

        await session.withTransaction(async () => {

            // -----------------------------------------
            // 1. Validate Hub
            // -----------------------------------------

            const hub = await Hub.findById(hubId)
                .session(session);

            if (!hub) {
                const error: any = new Error(
                    "Hub not found"
                );

                error.statusCode =
                    StatusCode.Not_Found;

                throw error;
            }

            if (hub.status !== HubStatus.ACTIVE) {
                const error: any = new Error(
                    "Hub is inactive"
                );

                error.statusCode =
                    StatusCode.Bad_Request;

                throw error;
            }

            // -----------------------------------------
            // 2. Validate Role
            // -----------------------------------------

            if (
                !Object.values(HubEmployeeRole).includes(role)
            ) {
                const error: any = new Error(
                    "Invalid hub employee role"
                );

                error.statusCode =
                    StatusCode.Bad_Request;

                throw error;
            }

            // -----------------------------------------
            // 3. Check Email
            // -----------------------------------------

            const existingEmail =
                await HubEmployee.findOne({
                    email: normalizedEmail,
                }).session(session);

            if (existingEmail) {
                const error: any = new Error(
                    "Employee email already exists"
                );

                error.statusCode =
                    StatusCode.Conflict;

                throw error;
            }

            // -----------------------------------------
            // 4. Check Phone
            // -----------------------------------------

            const existingPhone =
                await HubEmployee.findOne({
                    phoneNumber,
                }).session(session);

            if (existingPhone) {
                const error: any = new Error(
                    "Employee phone number already exists"
                );

                error.statusCode =
                    StatusCode.Conflict;

                throw error;
            }

            // -----------------------------------------
            // 5. Generate Employee ID
            // -----------------------------------------

            const employeeId =
                generateEmployeeId();

            // -----------------------------------------
            // 6. Create Hub Employee
            // -----------------------------------------

            [hubEmployee] =
                await HubEmployee.create(
                    [
                        {
                            employeeId,

                            hubId,

                            fullName,

                            email:
                                normalizedEmail,

                            phoneNumber,

                            role,

                            address,

                            emergencyContact,

                            notes,

                            photo,

                            createdBy,

                            isActive,

                            isAvailable: true,

                            status:
                                HubEmployeeStatus.ACTIVE,

                            joinedOn:
                                new Date(),
                        },
                    ],
                    {
                        session,
                    }
                );

            // -----------------------------------------
            // 7. Map Hub Employee Role
            // -----------------------------------------

            let logisticsRole: LogisticsRole;

            switch (role) {

                case HubEmployeeRole.HUB_MANAGER:
                    logisticsRole =
                        LogisticsRole.HUB_MANAGER;
                    break;

                case HubEmployeeRole.TL:
                    logisticsRole =
                        LogisticsRole.HUB_TL;
                    break;

                case HubEmployeeRole.AGENT:
                    logisticsRole =
                        LogisticsRole.AGENT;
                    break;
                case HubEmployeeRole.CASHIER:
                    logisticsRole = LogisticsRole.CASHIER;
                    break;
                default: {
                    const error: any =
                        new Error(
                            "Invalid hub employee role"
                        );

                    error.statusCode =
                        StatusCode.Bad_Request;

                    throw error;
                }
            }

            // -----------------------------------------
            // 8. Create Logistics Login
            // -----------------------------------------

            const logisticsUser =
                await createLogisticsUserService({
                    email: normalizedEmail,

                    password,

                    role: logisticsRole,

                    referenceId:
                        hubEmployee._id.toString(),

                    createdBy:
                        createdBy?.toString(),

                    session,
                });

            // -----------------------------------------
            // 9. Link Logistics Auth
            // -----------------------------------------

            hubEmployee.logisticsAuthId =
                logisticsUser._id;

            await hubEmployee.save({
                session,
            });
        });

        // -----------------------------------------
        // 10. Return Employee
        // -----------------------------------------

        return hubEmployee;

    } finally {
        await session.endSession();
    }
};

export const getAllEmployeesService = async (query: {
    employeeStatus?: string;
    role?: string;
    search?: string;
    page?: number;
    limit?: number;
}) => {
    try {
        // -----------------------------------------
        // 1. Pagination
        // -----------------------------------------

        const { skip, limit, page } =
            buildPaginationQuery(query);

        const {
            employeeStatus,
            role,
            search,
        } = query;

        // -----------------------------------------
        // 2. Build Filter
        // -----------------------------------------

        const matchStage: any = {};

        // -----------------------------------------
        // 3. Status Filter
        // -----------------------------------------

        if (employeeStatus) {
            matchStage.status = employeeStatus;
        }

        // -----------------------------------------
        // 4. Role Filter
        // -----------------------------------------

        if (role) {
            matchStage.role = role;
        }

        // -----------------------------------------
        // 5. Search
        // -----------------------------------------

        if (search?.trim()) {
            const searchValue = search.trim();

            matchStage.$or = [
                {
                    employeeId: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
                {
                    fullName: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
                {
                    email: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
                {
                    phoneNumber: {
                        $regex: searchValue,
                        $options: "i",
                    },
                },
            ];
        }

        // -----------------------------------------
        // 6. Fetch Employees + Count
        // -----------------------------------------

        const [employees, totalRecords] =
            await Promise.all([
                HubEmployee.find(matchStage)
                    .select(
                        `
                        _id
                        employeeId
                        hubId
                        fullName
                        email
                        phoneNumber
                        role
                        status
                        isAvailable
                        isActive
                        vehicleType
                        vehicleNumber
                        currentLocation
                        currentShipmentId
                        photo
                        joinedOn
                        createdAt
                        updatedAt
                        `
                    )
                    .populate({
                        path: "hubId",
                        select: "name hubCode city state",
                    })
                    .sort({
                        createdAt: -1,
                    })
                    .skip(skip)
                    .limit(limit)
                    .lean(),

                HubEmployee.countDocuments(matchStage),
            ]);

        // -----------------------------------------
        // 7. Pagination
        // -----------------------------------------

        const totalPages =
            Math.ceil(totalRecords / limit) || 1;

        // -----------------------------------------
        // 8. Format Employees
        // -----------------------------------------

        const formattedEmployees = employees.map(
            (employee: any) => ({
                _id: employee._id,

                // Business Employee ID
                employeeId: employee.employeeId,

                fullName: employee.fullName,

                email: employee.email,

                phoneNumber: employee.phoneNumber,

                role: employee.role,

                status: employee.status,

                isAvailable:
                    employee.isAvailable ?? true,

                isActive:
                    employee.isActive ?? true,

                hub: employee.hubId
                    ? {
                          _id: employee.hubId._id,
                          name: employee.hubId.name,
                          hubCode: employee.hubId.hubCode,
                          city: employee.hubId.city,
                          state: employee.hubId.state,
                      }
                    : null,

                vehicle: {
                    type:
                        employee.vehicleType ?? null,

                    number:
                        employee.vehicleNumber ?? null,
                },

                currentLocation:
                    employee.currentLocation ?? null,

                currentShipmentId:
                    employee.currentShipmentId ?? null,

                photo:
                    employee.photo ?? null,

                joinedOn:
                    employee.joinedOn ?? null,

                createdAt:
                    employee.createdAt,

                updatedAt:
                    employee.updatedAt,
            })
        );

        // -----------------------------------------
        // 9. Return Response
        // -----------------------------------------

        return {
            employees: formattedEmployees,

            meta: {
                totalRecords,

                totalPages,

                currentPage: page,

                limit,

                hasMore:
                    page < totalPages,
            },
        };
    } catch (error) {
        throw error;
    }
};

export const getEmployeeByIdService = async (
    employeeId: string
) => {
    try {
        // -----------------------------------------
        // 1. Validate Employee ID
        // -----------------------------------------

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            const error: any = new Error(
                "Invalid Employee ID format."
            );

            error.statusCode =
                StatusCode.Bad_Request;

            throw error;
        }

        // -----------------------------------------
        // 2. Get Employee
        // -----------------------------------------

        const employee =
            await HubEmployee.findOne({
                _id: employeeId,
                // isActive: true,
            })
                .populate({
                    path: "hubId",
                    select: "name hubCode city state",
                })
                .lean();

        // -----------------------------------------
        // 3. Employee Not Found
        // -----------------------------------------

        if (!employee) {
            const error: any = new Error(
                "Employee not found."
            );

            error.statusCode =
                StatusCode.Not_Found;

            throw error;
        }

        // -----------------------------------------
        // 4. Format Response
        // -----------------------------------------

        return {
            _id: employee._id,

            EmployeeId:
                employee.employeeId,

            fullName:
                employee.fullName,

            email:
                employee.email,

            phoneNumber:
                employee.phoneNumber,

            role:
                employee.role,

            status:
                employee.status,

            isAvailable:
                employee.isAvailable,

            isActive:
                employee.isActive,

            hub: employee.hubId
                ? {
                    _id:
                        (employee.hubId as any)._id,

                    name:
                        (employee.hubId as any).name,

                    hubCode:
                        (employee.hubId as any)
                            .hubCode,

                    city:
                        (employee.hubId as any)
                            .city,

                    state:
                        (employee.hubId as any)
                            .state,
                }
                : null,

            vehicle: {
                type:
                    employee.vehicleType ??
                    null,

                number:
                    employee.vehicleNumber ??
                    null,
            },

            address:
                employee.address ?? null,

            emergencyContact:
                employee.emergencyContact ??
                null,

            notes:
                employee.notes ?? null,

            photo:
                employee.photo ?? null,

            currentShipmentId:
                employee.currentShipmentId ??
                null,

            currentLocation:
                employee.currentLocation ??
                null,

            joinedOn:
                employee.joinedOn,

            createdAt:
                employee.createdAt,

            updatedAt:
                employee.updatedAt,
        };
    } catch (error) {
        throw error;
    }
};

export const getEmployeeByHubIdService = async (
    hubId: string,
    query: {
        page?: number;
        limit?: number;
        role?: HubEmployeeRole;
        status?: HubEmployeeStatus;
        search?: string;
    } = {}
) => {
    try {
        // -----------------------------------------
        // 1. Validate Hub ID
        // -----------------------------------------

        if (!mongoose.Types.ObjectId.isValid(hubId)) {
            const error: any = new Error(
                "Invalid Hub ID format."
            );

            error.statusCode = StatusCode.Bad_Request;
            throw error;
        }

        // -----------------------------------------
        // 2. Check Hub Exists
        // -----------------------------------------

        const hub = await Hub.findById(hubId).lean();

        if (!hub) {
            const error: any = new Error(
                "Hub not found."
            );

            error.statusCode = StatusCode.Not_Found;
            throw error;
        }

        // -----------------------------------------
        // 3. Pagination
        // -----------------------------------------

        const { skip, limit, page } =
            buildPaginationQuery(query);

        const hubObjectId =
            new mongoose.Types.ObjectId(hubId);

        // -----------------------------------------
        // 4. Build Filter
        // -----------------------------------------

        const filter: any = {
            hubId: hubObjectId,
            // isActive: true,
        };

        // -----------------------------------------
        // 5. Role Filter
        // -----------------------------------------

        if (query.role) {
            filter.role = query.role;
        }

        // -----------------------------------------
        // 6. Status Filter
        // -----------------------------------------

        if (query.status) {
            filter.status = query.status;
        }

        // -----------------------------------------
        // 7. Search Filter
        // -----------------------------------------

        if (query.search?.trim()) {
            const search = query.search.trim();

            filter.$or = [
                {
                    employeeId: {
                        $regex: search,
                        $options: "i",
                    },
                },
                {
                    fullName: {
                        $regex: search,
                        $options: "i",
                    },
                },
                {
                    email: {
                        $regex: search,
                        $options: "i",
                    },
                },
                {
                    phoneNumber: {
                        $regex: search,
                        $options: "i",
                    },
                },
            ];
        }

        // -----------------------------------------
        // 8. Fetch Employees + Count
        // -----------------------------------------

        const [
            employees,
            totalRecords,
        ] = await Promise.all([
            HubEmployee.find() // IMPORTANT: use filter here
                .select(
                    [
                        "_id",
                        "employeeId",
                        "hubId",
                        "fullName",
                        "email",
                        "phoneNumber",
                        "role",
                        "status",
                        "isAvailable",
                        "isActive",
                        "vehicleType",
                        "vehicleNumber",
                        "currentLocation",
                        "currentShipmentId",
                        "photo",
                        "joinedOn",
                        "createdAt",
                        "updatedAt",
                    ].join(" ")
                )
                .populate({
                    path: "hubId",
                    select: "name hubCode city state",
                })
                .sort({
                    createdAt: -1,
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            HubEmployee.countDocuments(filter),
        ]);

        // -----------------------------------------
        // 9. Pagination
        // -----------------------------------------

        const totalPages =
            Math.ceil(totalRecords / limit) || 1;

        // -----------------------------------------
        // 10. Format Employees
        // -----------------------------------------

        const formattedEmployees = employees.map(
            (employee: any) => ({
                _id: employee._id,

                employeeId: employee.employeeId,

                fullName: employee.fullName,

                email: employee.email,

                phoneNumber: employee.phoneNumber,

                role: employee.role,

                status: employee.status,

                isAvailable: employee.isAvailable,

                isActive: employee.isActive,

                hub: employee.hubId
                    ? {
                          _id: employee.hubId._id,
                          name: employee.hubId.name,
                          hubCode: employee.hubId.hubCode,
                          city: employee.hubId.city,
                          state: employee.hubId.state,
                      }
                    : null,

                vehicle: {
                    type: employee.vehicleType ?? null,
                    number: employee.vehicleNumber ?? null,
                },

                currentLocation:
                    employee.currentLocation ?? null,

                currentShipmentId:
                    employee.currentShipmentId ?? null,

                photo: employee.photo ?? null,

                joinedOn: employee.joinedOn,

                createdAt: employee.createdAt,

                updatedAt: employee.updatedAt,
            })
        );

        // -----------------------------------------
        // 11. Return Response
        // -----------------------------------------

        return {
            employees: formattedEmployees,

            meta: {
                totalRecords,

                totalPages,

                currentPage: page,

                limit,

                hasMore: page < totalPages,
            },
        };
    } catch (error) {
        throw error;
    }
};