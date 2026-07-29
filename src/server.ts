require("dotenv").config();

import app from "./app";
import connectDatabase from "./config/db";

import http from "http";
import mongoose from "mongoose";
export const server = http.createServer(app);

export const PORT = process.env.PORT || 5000;

export const startServer = async () => {
    try {
        await connectDatabase();

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.log("err", err);
        process.exit(1);
    }
};

if (process.env.NODE_ENV !== "test") {
    startServer();
}

process.on("SIGINT", async () => {
    try {
        await mongoose.connection.close();
        console.log("MongoDB connection closed");
        process.exit(0);
    } catch (err) {
        console.error("Error closing MongoDB connection:", err);
        process.exit(1);
    }
});
