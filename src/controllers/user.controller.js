import { asynchandler } from "../utils/asyncHandler.js";

const registerUser = asynchandler((req, res) => {
  res.status(201).json({
    message: "successfully registered",
  });
});

export { registerUser };
