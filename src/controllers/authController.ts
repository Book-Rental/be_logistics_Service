import { ILogisticsAuth } from "../models/LogisticsAuth";
import { loginService } from "../services/authService";
import { GUEST_COOKIE_NAME, JWT_TOKEN_NAME, Messages } from "../utils/constants";
import { generateToken, verifyGuestToken } from "../utils/jwt";
import { comparePasswords } from "../utils/passwordValidation";
import { failResponse, successResponse } from "../utils/response";
import { StatusCode } from "../utils/StatusCodes";
import { Request, Response } from "express";

const isProd = process.env.NODE_ENV === "production";
// POST login user
export const loginLogistics = async (req: Request, res: Response): Promise<void> => {
    try {
        const credentials = req.body as { email: string; password: string };
        const userInfo: ILogisticsAuth | any = await loginService(credentials?.email);

        if (!userInfo) {
            failResponse(res, Messages.User_Not_Available, StatusCode.Not_Found);
            return;
        }

        if (userInfo?.password) {
            const password = await comparePasswords(credentials.password, userInfo.password);
            if (!password) {
                failResponse(res, Messages.Password_Not_Matched, StatusCode.Unauthorized);
                return;
            }
        } else {
            failResponse(res, Messages.Unauthorized_User, StatusCode.Unauthorized);
            return;
        }
        const token = await generateToken(userInfo);
        res.cookie(`${JWT_TOKEN_NAME}`, token, {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
            maxAge: 24 * 60 * 60 * 1000,
        });
        successResponse(res, { userInfo, token }, Messages.UserAuthenticated, StatusCode.OK);
    } catch (err: any) {
        failResponse(res, err?.message || err, StatusCode.Bad_Request);
    }
};
