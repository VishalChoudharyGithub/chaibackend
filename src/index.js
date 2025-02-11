import "dotenv/config";
import { app } from "./app.js";
import connectDB from "./db/index.js";

connectDB()
  .then(() => {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log("listening on port ", port);
    });
  })
  .catch((e) => console.error("MongoDB connecction failed ", e));
