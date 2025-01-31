import connectDB from "./db/index.js";
import "dotenv/config";

connectDB();
console.log(process.env.MONGODB_URI);
