import mongoose from "mongoose";
import Agent from "../models/Agent";
import Hub from "../models/hub";
import HubEmployee from "../models/HubEmployee";

export const getHubEmployeesService = async (hubId: string) => {
    const hub = await Hub.findById(hubId);

    if (!hub) {
        const error: any = new Error("Hub not found");
        error.statusCode = 404;
        throw error;
    }

    const employees = await HubEmployee.find({
        hubId: hub._id,
    });

    const agents = await Agent.find({
        hubId: hub._id,
        isActive: true,
    });

    const manager = {
        fullName: hub.managerName,
        email: hub.email,
        phoneNumber: hub.phoneNumber,
        role: "MANAGER",
    };

    const cashierEmployees = employees
        .filter((employee) => employee.role === "CASHIER")
        .map((employee) => ({
            fullName: employee.fullName,
            email: employee.email,
            phoneNumber: employee.phoneNumber,
            role: employee.role,
        }));

    const teamLeadEmployees = employees
        .filter((employee) => employee.role === "TEAM_LEAD")
        .map((employee) => ({
            fullName: employee.fullName,
            email: employee.email,
            phoneNumber: employee.phoneNumber,
            role: employee.role,
        }));

    const agentEmployees = agents.map((agent) => ({
        fullName: agent.fullName,
        email: agent.email,
        phoneNumber: agent.phoneNumber,
        role: "AGENT",
    }));

    const allEmployees = [
        manager,
        ...cashierEmployees,
        ...teamLeadEmployees,
        ...agentEmployees,
    ];

    return {
        hub,
        employees: allEmployees,
        summary: {
            totalEmployees: allEmployees.length,
        },
    };
};