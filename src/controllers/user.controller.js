import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadToCloud } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import { options } from "../utils/cookie.js";

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
const registerUser = asyncHandler(async (req, res) => {
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

const loginUser = asyncHandler(async (req, res) => {
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
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    $unset: {
      refreshToken: 1,
    },
  });
  res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logged out successfully."));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
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

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) throw new ApiError(400, "Incorrect password");

  if (oldPassword === newPassword)
    throw new ApiError(400, "Current and old password cannot be same.");
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully."));
});
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { email, fullName } = req.body;
  if (!email || !fullName)
    throw new ApiError(400, "email and fullName are required.");
  const user = await User.findByIdAndUpdate(
    { _id: req.user?._id },
    {
      $set: {
        email,
        fullName,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  res
    .status(200)
    .json(new ApiResponse(200, user, "User updated successfully."));
});
const updateCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;
  if (!coverImageLocalPath)
    throw new ApiError(400, "Cover image is not provided.");
  const coverImage = await uploadToCloud(coverImageLocalPath);
  if (!coverImage.url) throw new ApiError(400, "Failed to upload cover image.");
  const user = await User.findByIdAndUpdate(
    { _id: req.user?._id },
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  res
    .status(200)
    .json(new ApiResponse(200, user, "CoverImage updated successfully."));
});
const updateAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  if (!avatarLocalPath) throw new ApiError(400, "Avatar is not provided.");
  const avatar = await uploadToCloud(avatarLocalPath);
  if (!avatar.url) throw new ApiError(400, "Failed to upload avatar.");
  const user = await User.findByIdAndUpdate(
    { _id: req.user?._id },
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");
  res
    .status(200)
    .json(new ApiResponse(200, user, "avatar updated successfully."));
});

const getChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) throw new ApiError(400, "username is required");

  const channel = User.aggregate([
    {
      $match: {
        username: username.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        foreignField: "channel",
        localField: "_id",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        foreignField: "subscriber",
        localField: "_id",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "subscribers",
        },
        subscribedToCount: {
          $size: "subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        username: 1,
        email: 1,
        subscribersCount: 1,
        subscribedToCount: 1,
        isSubscribed: 1,
        fullName: 1,
        avatar: 1,
        coverImage: 1,
      },
    },
  ]);
  if (!channel?.length) throw new ApiError(404, "Channel not found.");

  res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "Channel details fetched successfully.")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = User.aggregate([
    {
      $lookup: {
        from: "videos",
        foreignField: "_id",
        localField: "watchHistory",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              foreignField: "_id",
              localField: "owner",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "watch history fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  updateAccountDetails,
  updateAvatar,
  updateCoverImage,
  getChannelProfile,
  getWatchHistory,
  getCurrentUser,
};
