import multer from "multer";

// Use memory storage to get file buffers for Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

export default upload;
