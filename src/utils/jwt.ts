const jwt = require("jsonwebtoken");

// Function to generate a JWT token
export const generateToken = async (user: { _id: string; email: string }) => {
    return await jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: process.env.JWT_EXPIRES_IN,
    });
};

// Function to verify a JWT token
export const verifyToken = async (token: string) => {
    const tokenDetail = jwt.decode(token);
    if (process.env.ENABLEJWT === "true") {
        return await jwt.verify(token, process.env.JWT_SECRET);
    }
    return tokenDetail;
};

// Guest token: lightweight JWT carrying only anonymousId (UUID).
// Used for anonymous cart operations. No email/user identity.
export const signGuestToken = (anonymousId: string): string => {
    return jwt.sign({ anonymousId }, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: "30d", // guest cookie expiry
    });
};

export const verifyGuestToken = (token: string): { anonymousId: string } | null => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && typeof decoded === "object" && (decoded as any).anonymousId) {
            return decoded as { anonymousId: string };
        }
        return null;
    } catch {
        return null;
    }
};
