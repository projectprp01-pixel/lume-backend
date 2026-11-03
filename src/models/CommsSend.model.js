import mongoose from 'mongoose';

// One row per (template, booking, channel) the Comms scheduler has decided to act on. The unique
// index is what makes sending idempotent: the row is inserted BEFORE the provider call, so two
// overlapping ticks (or two server instances) can never message the same guest twice.
//
// Only final decisions and real attempts are written. A message held back for a reason that can
// still clear (e.g. a WhatsApp template awaiting Meta approval) is not recorded, so it is picked up
// automatically on a later tick while still inside its send window.
const commsSendSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  templateId: { type: String, required: true },
  // Snapshot at send time, so the log stays readable after a template is renamed or deleted.
  templateName: { type: String, default: '' },
  stage: { type: String, enum: ['prestay', 'instay', 'poststay'], required: true },
  channel: { type: String, enum: ['email', 'whatsapp'], required: true },
  category: { type: String, enum: ['utility', 'marketing'], default: 'utility' },
  bookingId: { type: String, required: true },
  guestName: { type: String, default: '' },
  // Where it went — email address or E.164 number. Shown to staff in the log.
  to: { type: String, default: '' },
  // sending = claimed, provider call in flight; sent = accepted by the provider;
  // failed = provider rejected / errored (retried a few times); skipped = decided not to send.
  status: { type: String, enum: ['sending', 'sent', 'failed', 'skipped'], required: true },
  reason: { type: String, default: '' },
  providerMessageId: { type: String, default: '' },
  dueAt: Date,
  sentAt: Date,
  attempts: { type: Number, default: 0 },
  lastAttemptAt: Date,
}, { timestamps: true });

commsSendSchema.index({ templateId: 1, bookingId: 1, channel: 1 }, { unique: true });
commsSendSchema.index({ propertyId: 1, createdAt: -1 });
commsSendSchema.index({ bookingId: 1 });

export default mongoose.model('CommsSend', commsSendSchema);
