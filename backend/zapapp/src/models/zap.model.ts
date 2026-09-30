import { Schema, model, type Types } from 'mongoose';
import { triggerKey } from '../catalog/catalog.js';

const zapSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    enabled: { type: Boolean, default: false },
    trigger: {
      app: { type: String, required: true },
      event: { type: String, required: true },
      // Derived "app:event"; used by the webhook dispatcher (M3) to find matching Zaps.
      key: { type: String, required: true },
      // Shape depends on the trigger; validated against the catalog before saving.
      config: { type: Schema.Types.Mixed, default: {} },
    },
    action: {
      app: { type: String, required: true },
      type: { type: String, required: true },
      fields: { type: Schema.Types.Mixed, default: {} },
    },
    source: { type: String, enum: ['manual', 'copilot'], default: 'manual' },
    lastRunAt: { type: Date, default: null },
    lastRunStatus: { type: String, enum: ['success', 'failed', null], default: null },
    // Short reason for the last failure, shown on the Zap list.
    lastRunError: { type: String, default: null },
  },
  { timestamps: true, minimize: false },
);

zapSchema.pre('validate', function setTriggerKey() {
  if (this.trigger?.app && this.trigger?.event) {
    this.trigger.key = triggerKey(this.trigger.app, this.trigger.event);
  }
});

// List page: a user's Zaps, newest first.
zapSchema.index({ owner: 1, updatedAt: -1 });
// Webhook dispatch (M3): enabled Zaps for one trigger on one repo.
zapSchema.index({ enabled: 1, 'trigger.key': 1, 'trigger.config.repoFullName': 1, owner: 1 });

/** Plain shape of a stored Zap (what .lean() / .toObject() return). */
export interface ZapDoc {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  name: string;
  enabled: boolean;
  trigger: { app: string; event: string; key: string; config: Record<string, string> };
  action: { app: string; type: string; fields: Record<string, string> };
  source: 'manual' | 'copilot';
  lastRunAt: Date | null;
  lastRunStatus: 'success' | 'failed' | null;
  lastRunError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ZapModel = model('Zap', zapSchema);
