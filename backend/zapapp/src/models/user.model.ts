import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const userSchema = new Schema(
  {
    githubId: { type: Number, required: true, unique: true },
    login: { type: String, required: true },
    name: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    email: { type: String, default: null },
    // Encrypted with lib/crypto.ts. select:false keeps it out of every query unless asked for explicitly.
    accessTokenEnc: { type: String, required: true, select: false },
    tokenScopes: { type: [String], default: [] },
    tokenStatus: { type: String, enum: ['valid', 'revoked'], default: 'valid' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

export const UserModel = model('User', userSchema);
