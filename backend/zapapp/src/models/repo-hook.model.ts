import { Schema, model, type Types } from 'mongoose';

/**
 * One GitHub webhook per (user, repository), created by the app and shared by all of that user's
 * Zaps on the repo. hookId is what GitHub sends in X-GitHub-Hook-ID, so a delivery maps to its owner.
 */
const repoHookSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repoFullName: { type: String, required: true },
    hookId: { type: Number, required: true, unique: true },
    url: { type: String, required: true },
  },
  { timestamps: true },
);

repoHookSchema.index({ owner: 1, repoFullName: 1 }, { unique: true });

export interface RepoHookDoc {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  repoFullName: string;
  hookId: number;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export const RepoHookModel = model('RepoHook', repoHookSchema);
