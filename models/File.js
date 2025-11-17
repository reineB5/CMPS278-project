const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ['document', 'spreadsheet', 'presentation', 'pdf', 'video', 'archive', 'folder', 'text'],
    },
    location: {
      type: String,
      enum: ['My Drive', 'Shared with me', 'Trash'],
      default: 'My Drive',
    },
    sharedWith: { type: [String], default: [] },
    description: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
    lastOpenedAt: { type: Date, default: Date.now },
    sizeMb: { type: Number, default: 0 },
    isFolder: { type: Boolean, default: false },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', default: null },
    starred: { type: Boolean, default: false },
    trashed: { type: Boolean, default: false },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    storagePath: { type: String },
    isUploaded: { type: Boolean, default: false },
    availableOffline: { type: Boolean, default: false },
  },
  { timestamps: true }
);

fileSchema.index({ name: 'text', owner: 'text', description: 'text' });

module.exports = mongoose.model('File', fileSchema);

