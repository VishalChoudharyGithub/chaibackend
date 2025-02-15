import { asynchandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadToCloud } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import { Cookie, options } from "../utils/cookie.js";

const generateAccessAndRefreshToken = async (user) => {
  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: true });
    return {
      accessToken,
      refreshToken,
    };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while creating access and refresh token."
    );
  }
};
const registerUser = asynchandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }
  const existedUser = await User.findOne({ $or: [{ username }, { email }] });
  if (existedUser)
    throw new ApiError(409, "username or email already registered.");
  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  if (!avatarLocalPath) throw new ApiError(400, "Avatar is required.");
  const avatar = await uploadToCloud(avatarLocalPath);
  const coverImage = await uploadToCloud(coverImageLocalPath);
  if (!avatar)
    throw new ApiError(
      400,
      "Avatar image failed to upload. Please resent or use another image."
    );
  const user = await User.create({
    fullName,
    email,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    password,
    username: username.toLowerCase(),
  });
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!createdUser)
    throw new ApiError(500, "Something went wrong while registering the user.");
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully."));
});

const loginUser = asynchandler(async (req, res) => {
  const { username, email, password } = req.body;
  if (!email && !username)
    throw new ApiError(400, "Email or username is required.");

  if (password.trim() === "") throw new ApiError(400, "Password is required");

  const user = await User.findOne({ $or: [{ username }, { email }] });
  if (!user) throw new ApiError(404, "User does not exist");
  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect) throw new ApiError(401, "Invalid user credentials");

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user);
  const loggedInUser = await User.findOne(user._id).select(
    "-password -refreshToken"
  );
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User created successfully."
      )
    );
});
const logoutUser = asynchandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    $set: {
      refreshToken: undefined,
    },
  });
  res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logged out successfully."));
});

const refreshAccessToken = asynchandler(async (req, res) => {
  const userRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
  if (!userRefreshToken) throw new ApiError(401, "Refresh token is required.");
  try {
    const decodedRefreshToken = jwt.verify(
      userRefreshToken,
      process.env.ACCESS_TOKEN_SECRET
    );
    const user = await User.findOne({ _id: decodedRefreshToken._id });
    if (!user) throw new ApiError(401, "Invalid refresh token.");

    const { accessToken, refreshToken } =
      await generateAccessAndRefreshToken(user);
    res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken,
          },
          "AccessToken refreshed successfully."
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token.");
  }
});

export { registerUser, loginUser, logoutUser, refreshAccessToken };
