import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import routes from "./router";
import { errorResponse } from "./utils/response";
const app: any = express();

app.use(express.json());
app.use(
    cors({
        origin: [
            "http://localhost:3000",
            "http://localhost:5173",
            "https://fe-book-rental-host.onrender.com",
        ],
        credentials: true,
    })
);

app.use(morgan("dev"));
app.use(cookieParser());

app.use("/api", routes);

app.use((err: any, req: any, res: any, next: any) => {
    console.error(err.stack);
    errorResponse(res, "Something went wrong!", 500, err);
});

export default app;
