const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const File = require('../models/File');

const sampleFiles = [
  {
    name: 'Q4 Strategy Deck',
    owner: 'Hala',
    type: 'presentation',
    location: 'My Drive',
    sharedWith: ['adam@acme.com', 'maya@acme.com'],
    uploadedAt: '2025-09-21T10:12:00Z',
    lastOpenedAt: '2025-11-15T14:35:00Z',
    sizeMb: 18,
    isFolder: false,
  },
  {
    name: 'Product Roadmap',
    owner: 'Hala',
    type: 'document',
    location: 'My Drive',
    sharedWith: ['sara@acme.com'],
    uploadedAt: '2025-07-02T08:05:00Z',
    lastOpenedAt: '2025-11-13T16:45:00Z',
    sizeMb: 4,
  },
  {
    name: 'Marketing Assets',
    owner: 'Adam',
    type: 'folder',
    location: 'Shared with me',
    sharedWith: ['hala@acme.com'],
    uploadedAt: '2025-05-18T09:00:00Z',
    lastOpenedAt: '2025-11-12T09:15:00Z',
    sizeMb: 240,
    isFolder: true,
  },
  {
    name: 'Invoices.zip',
    owner: 'Finance',
    type: 'archive',
    location: 'My Drive',
    sharedWith: [],
    uploadedAt: '2025-10-01T11:30:00Z',
    lastOpenedAt: '2025-11-10T11:00:00Z',
    sizeMb: 92,
  },
  {
    name: 'UX Copy Guide',
    owner: 'Lina',
    type: 'document',
    location: 'Shared with me',
    sharedWith: ['hala@acme.com'],
    uploadedAt: '2025-09-10T10:30:00Z',
    lastOpenedAt: '2025-11-09T13:42:00Z',
    sizeMb: 2,
  },
  {
    name: 'Sprint Review.mp4',
    owner: 'Maya',
    type: 'video',
    location: 'My Drive',
    sharedWith: ['product@acme.com'],
    uploadedAt: '2025-10-24T18:00:00Z',
    lastOpenedAt: '2025-11-08T19:32:00Z',
    sizeMb: 512,
  },
  {
    name: 'Hiring Plan',
    owner: 'Hala',
    type: 'spreadsheet',
    location: 'My Drive',
    sharedWith: ['hr@acme.com'],
    uploadedAt: '2025-08-12T08:00:00Z',
    lastOpenedAt: '2025-11-07T08:21:00Z',
    sizeMb: 6,
  },
  {
    name: 'Team Photos',
    owner: 'Lina',
    type: 'folder',
    location: 'Shared with me',
    sharedWith: ['hala@acme.com'],
    uploadedAt: '2025-03-02T08:00:00Z',
    lastOpenedAt: '2025-11-06T18:45:00Z',
    sizeMb: 1024,
    isFolder: true,
  },
  {
    name: 'API Postman Collection',
    owner: 'Adam',
    type: 'archive',
    location: 'My Drive',
    sharedWith: [],
    uploadedAt: '2025-06-14T07:00:00Z',
    lastOpenedAt: '2025-11-05T10:55:00Z',
    sizeMb: 12,
  },
  {
    name: 'Support Playbook',
    owner: 'Support',
    type: 'document',
    location: 'My Drive',
    sharedWith: ['support@acme.com'],
    uploadedAt: '2025-07-30T06:35:00Z',
    lastOpenedAt: '2025-11-04T07:45:00Z',
    sizeMb: 3,
  },
  {
    name: 'OKR Tracker',
    owner: 'Hala',
    type: 'spreadsheet',
    location: 'My Drive',
    sharedWith: ['leadership@acme.com'],
    uploadedAt: '2025-08-05T06:00:00Z',
    lastOpenedAt: '2025-11-03T08:00:00Z',
    sizeMb: 5,
  },
  {
    name: 'Design System',
    owner: 'Lina',
    type: 'folder',
    location: 'Shared with me',
    sharedWith: ['hala@acme.com', 'adam@acme.com'],
    uploadedAt: '2025-04-12T12:00:00Z',
    lastOpenedAt: '2025-11-02T14:00:00Z',
    sizeMb: 850,
    isFolder: true,
  },
  {
    name: 'Quarterly Budget.xlsx',
    owner: 'Finance',
    type: 'spreadsheet',
    location: 'My Drive',
    sharedWith: ['hala@acme.com'],
    uploadedAt: '2025-09-20T06:00:00Z',
    lastOpenedAt: '2025-11-01T09:10:00Z',
    sizeMb: 7,
  },
  {
    name: 'Security Audit.pdf',
    owner: 'Security',
    type: 'pdf',
    location: 'My Drive',
    sharedWith: ['hala@acme.com'],
    uploadedAt: '2025-10-10T12:30:00Z',
    lastOpenedAt: '2025-10-30T13:00:00Z',
    sizeMb: 11,
  },
  {
    name: 'Team Standup Notes',
    owner: 'Hala',
    type: 'document',
    location: 'My Drive',
    sharedWith: ['team@acme.com'],
    uploadedAt: '2025-11-01T07:00:00Z',
    lastOpenedAt: '2025-11-16T07:30:00Z',
    sizeMb: 1,
  },
  {
    name: 'Engineering Wiki',
    owner: 'Adam',
    type: 'folder',
    location: 'My Drive',
    sharedWith: ['engineering@acme.com'],
    uploadedAt: '2025-02-20T05:00:00Z',
    lastOpenedAt: '2025-11-14T06:20:00Z',
    sizeMb: 560,
    isFolder: true,
  },
  {
    name: 'User Interviews',
    owner: 'Research',
    type: 'video',
    location: 'Shared with me',
    sharedWith: ['hala@acme.com'],
    uploadedAt: '2025-09-05T11:35:00Z',
    lastOpenedAt: '2025-11-11T15:15:00Z',
    sizeMb: 780,
  },
  {
    name: 'Press Kit',
    owner: 'Comms',
    type: 'archive',
    location: 'My Drive',
    sharedWith: ['media@acme.com'],
    uploadedAt: '2025-08-25T08:45:00Z',
    lastOpenedAt: '2025-11-05T09:15:00Z',
    sizeMb: 65,
  },
  {
    name: 'Support Tickets Export',
    owner: 'Support',
    type: 'spreadsheet',
    location: 'My Drive',
    sharedWith: ['support@acme.com'],
    uploadedAt: '2025-10-28T10:10:00Z',
    lastOpenedAt: '2025-11-15T10:00:00Z',
    sizeMb: 9,
  },
  {
    name: 'Company Handbook',
    owner: 'HR',
    type: 'pdf',
    location: 'My Drive',
    sharedWith: ['all@acme.com'],
    uploadedAt: '2025-01-05T09:00:00Z',
    lastOpenedAt: '2025-11-13T12:00:00Z',
    sizeMb: 15,
  },
  {
    name: 'Beta Feedback',
    owner: 'Product',
    type: 'document',
    location: 'My Drive',
    sharedWith: ['product@acme.com'],
    uploadedAt: '2025-11-05T13:00:00Z',
    lastOpenedAt: '2025-11-16T09:22:00Z',
    sizeMb: 3,
  },
];

async function seed() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI missing from environment');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    await File.deleteMany({});
    const docs = sampleFiles.map((file) => ({
      ...file,
      sizeBytes: Math.round((file.sizeMb || 0) * 1024 * 1024),
    }));
    await File.insertMany(docs);
    console.log(`Inserted ${sampleFiles.length} files`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

seed();
