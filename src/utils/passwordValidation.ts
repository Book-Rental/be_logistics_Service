import bcrypt from "bcrypt";

export const comparePasswords = async (plainPassword: string, hashedPassword: string) => {
    try {
        const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
        return isMatch;
    } catch (err) {
        console.error("Error comparing passwords:", err);
        return err;
    }
};
