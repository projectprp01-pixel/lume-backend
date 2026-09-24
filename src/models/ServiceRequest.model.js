import mongoose from 'mongoose';

const serviceRequestSchema = new mongoose.Schema({
  item: { type: String, required: true },
  category: { type: String, default: 'General' },
  department: { type: String, required: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
  guestName: { type: String, default: '' },
  roomNumber: { type: String, default: '' },
  status: {
    type: String,
    enum: ['Pending', 'Assigned', 'In-progress', 'Completed'],
    default: 'Pending'
  },
  priority: {
    type: String,
    enum: ['High', 'Normal'],
    default: 'Normal'
  },
  source: {
    type: String,
    enum: ['Chat', 'App', 'Phone Call', 'Manual Entry'],
    default: 'Chat'
  },
  guestComment: { type: String, default: '' },
  aiSummary: { type: String, default: '' },
  actionables: [{ type: String }],
  notes: { type: String, default: '' },
  assignee: { type: String, default: '' },
  // Who accepted the ticket, snapshotted at accept time. Completion is atomic to this
  // person (or their department's manager) — see utils/requestAccess.js. `department`
  // is null when a GM/Admin accepted it (they belong to no department).
  acceptedBy: {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    name: { type: String, default: '' },
    department: { type: String, default: null },
    acceptedAt: { type: Date, default: null },
  },
  // Main-stay Booking ID the guest was on when they submitted (shown in the Requests Hub).
  bookingId: { type: String, default: '' },
  // How `department` was chosen: the AI layer, the first-department fallback, or a
  // manual re-route by staff. See src/ai/classifyRequest.js.
  routing: {
    source: { type: String, enum: ['ai', 'fallback', 'manual'], default: 'fallback' },
    confidencePct: { type: Number, default: null },
    reason: { type: String, default: '' },
    routedBy: { type: String, default: '' },
  },
  eta: { type: String, default: 'TBD' },
  slaDue: { type: Date },
  completedAt: { type: Date, default: null },
  propertyId: { type: String, default: 'default' },
  alertEmailFailed: { type: Boolean, default: false },
  replies: [{
    body: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: String, default: 'Front Desk' }
  }]
}, { timestamps: true });

serviceRequestSchema.index({ guestId: 1 });
serviceRequestSchema.index({ status: 1, createdAt: -1 });
serviceRequestSchema.index({ guestId: 1, status: 1 });
serviceRequestSchema.index({ propertyId: 1, createdAt: -1 });

export default mongoose.model('ServiceRequest', serviceRequestSchema);
