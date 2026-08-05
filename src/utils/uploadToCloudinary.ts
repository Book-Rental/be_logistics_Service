import cloudinary from "../config/cloudinary";

export const uploadToCloudinary = (
    fileBuffer: Buffer,
    folder: string,
    filename: string
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: filename,
                resource_type: "image",
            },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (!result?.secure_url) {
                    reject(new Error("Cloudinary upload failed"));
                    return;
                }

                resolve(result.secure_url);
            }
        );

        stream.end(fileBuffer);
    });
};
