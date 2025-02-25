import mongoose, { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid video id");
  const videoObjectId = new mongoose.Types.ObjectId(videoId);
  const comments = await Comment.aggregate([
    {
      $match: {
        video: videoObjectId,
      },
    },
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "owner",
        as: "commentedBy",
      },
    },
    {
      $lookup: {
        from: "videos",
        foreignField: "_id",
        localField: "video",
        as: "videoDetails",
      },
    },
    {
      $project: {
        content: 1,
        createdAt: 1,
        owner: { $first: "$commentedBy" },
        video: { $first: "$videoDetails" },
      },
    },
    {
      $skip: (page - 1) * parseInt(limit),
    },
    {
      $limit: parseInt(limit),
    },
  ]);

  if (!comments.length) throw new ApiError(404, "Comments not found.");
  return res
    .status(200)
    .json(new ApiResponse(200, comments, "Comments fetched successfully"));
});

const addComment = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { content } = req.body;
  if (!videoId) throw new ApiError(400, "Video Id is required.");
  if (!content) throw new ApiError(400, "Content is required.");
  try {
    await Comment.create({
      content,
      owner: req.user._id,
      video: videoId,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, videoId, "Comment added successfully"));
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while saving comment.",
      error
    );
  }
});

const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;
  if (!commentId.trim()) throw new ApiError(400, "CommentId is required");
  if (!content?.trim()) throw new ApiError(400, "new comment can't be empty");
  const comment = await Comment.findByIdAndUpdate(
    {
      _id: commentId,
    },
    {
      $set: {
        content,
      },
    },
    { new: true }
  );
  if (!comment) throw new ApiError(404, "Comment not found");
  res
    .status(200)
    .json(new ApiResponse(200, comment, "comment updated successfully"));
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  if (!commentId.trim()) throw new ApiError(400, "CommentId is required");

  const comment = await Comment.deleteOne({ _id: commentId });
  if (comment.deletedCount === 0) {
    throw new ApiError(404, "Comment not found");
  }
  res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment deleted successfully"));
});

export { getVideoComments, addComment, updateComment, deleteComment };
