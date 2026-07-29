import bcrypt from "bcrypt";
import LogisticsAuth, { LogisticsRole } from "../models/LogisticsAuth";
import { ClientSession } from "mongoose";

interface CreateLogisticsUserDto {
    email: string;
    password: string;
    role: LogisticsRole;
    referenceId: string;
    createdBy?: string;
    session?: ClientSession;
}

export const createLogisticsUserService = async ({
    email,
    password,
    role,
    referenceId,
    createdBy,
    session,
}: CreateLogisticsUserDto) => {
    const normalizedEmail = email.toLowerCase();

    // Check whether the email already exists (participates in the caller's
    // transaction when a session is provided)
    const existingUser = await LogisticsAuth.findOne({
        email: normalizedEmail,
    }).session(session ?? null);

    if (existingUser) {
        throw new Error("Email already exists");
    }

    // Hash the password
    const newpassword = await bcrypt.hash(password, 10);
    const [logisticsUser] = await LogisticsAuth.create(
        [
            {
                email: normalizedEmail,
                password: newpassword,
                role,
                referenceId,
                createdBy,
            },
        ],
        { session }
    );

    return logisticsUser;
};

export const loginService = async (email: string) => {
    try {
        return await LogisticsAuth.findOne({ email }).exec();
    } catch (err) {
        return err;
    }
};
