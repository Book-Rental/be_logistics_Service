import mongoose from "mongoose";
const connetDataBase = async (): Promise<any> => {
    console.log("MangoDB connecting....");
    try {
        mongoose?.connection?.close();
        const clientOptions: mongoose.ConnectOptions = {
            serverApi: { version: "1" as "1", strict: true, deprecationErrors: true },
            family: 4,
        };

        await mongoose.connect(
            `${process.env.MONGO_URL}${process.env.DATABASE}?retryWrites=true&w=majority`,
            clientOptions
        );
    } catch (err) {
        console.error(err);
        throw err;
    }
};

// Listen to connection events
mongoose.connection.on("connected", () => {
    console.log("Mongoose connected to MongoDB");
});

mongoose.connection.on("disconnected", () => {
    console.log("Mongoose disconnected");
});

mongoose.connection.on("error", (err: any) => {
    console.log("Error in MongoDB connection:", err);
});

export default connetDataBase;
