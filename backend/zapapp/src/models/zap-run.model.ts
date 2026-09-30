import { Schema, model, type Types } from 'mongoose';

/**
 * One execution of one Zap for one GitHub delivery. The unique (zap, deliveryId) index makes
 * execution idempotent: a redelivered webhook cannot insert a second run, so it can't comment twice.
 */
const zapRunSchema = new Schema(
  {
    zap: { type: Schema.Types.ObjectId, ref: 'Zap', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deliveryId: { type: String, required: true },
    status: { type: String, enum: ['running', 'success', 'failed'], required: true },
    repoFullName: { type: String, required: true },
    prNumber: { type: Number, required: true },
    renderedBody: { type: String, default: null },
    commentUrl: { type: String, default: null },
    error: {
      type: new Schema({ code: String, message: String, status: Number }, { _id: false }),
      default: null,
    },
    durationMs: { type: Number, default: null },
  },
  { timestamps: true },
);

zapRunSchema.index({ zap: 1, deliveryId: 1 }, { unique: true });
zapRunSchema.index({ zap: 1, createdAt: -1 });
// Keep 30 days of history.
zapRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export interface ZapRunDoc {
  _id: Types.ObjectId;
  zap: Types.ObjectId;
  owner: Types.ObjectId;
  deliveryId: string;
  status: 'running' | 'success' | 'failed';
  repoFullName: string;
  prNumber: number;
  renderedBody: string | null;
  commentUrl: string | null;
  error: { code: string; message: string; status?: number } | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ZapRunModel = model('ZapRun', zapRunSchema);
