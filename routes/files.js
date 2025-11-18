const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const File = require('../models/File');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

const sortMap = {
  recent: { lastOpenedAt: -1 },
  name: { name: 1 },
  size: { sizeMb: -1 },
  uploadedAt: { uploadedAt: -1 },
};

router.get('/', async (req, res, next) => {
  try {
    const {
      view = 'mydrive',
      primary = 'all',
      type,
      people,
      location,
      modified,
      search = '',
      advName = '',
      advOwner = '',
      advShared = '',
      advContent = '',
      sort = 'recent',
      limit = 20,
      skip = 0,
      parentId,
    } = req.query;

    const baseQuery = { trashed: false };
    const andFilters = [];

    if (view === 'trash') {
      baseQuery.trashed = true;
    }

    if (view === 'shared') {
      baseQuery.location = 'Shared with me';
    }

    if (view === 'starred') {
      baseQuery.starred = true;
    }

    if (primary === 'files') baseQuery.isFolder = false;
    if (primary === 'folders') baseQuery.isFolder = true;

    if (type) baseQuery.type = type;
    if (location) baseQuery.location = location;

    if (parentId !== undefined) {
      const { filter, error } = normalizeParentFilter(parentId);
      if (error) {
        return res.status(400).json({ message: error });
      }
      baseQuery.parentId = filter;
    }

    if (modified) {
      const daysMap = { today: 1, week: 7, month: 30 };
      const days = daysMap[modified];
      if (days) {
        const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        baseQuery.uploadedAt = { $gte: threshold };
      }
    }

    if (search) {
      andFilters.push({ name: { $regex: search, $options: 'i' } });
    }

    if (advName) {
      andFilters.push({ name: { $regex: advName, $options: 'i' } });
    }

    if (advOwner) {
      andFilters.push({ owner: { $regex: advOwner, $options: 'i' } });
    }

    if (people) {
      andFilters.push({ sharedWith: people });
    }

    if (advShared) {
      andFilters.push({ sharedWith: { $elemMatch: { $regex: advShared, $options: 'i' } } });
    }

    if (advContent) {
      baseQuery.$text = { $search: advContent };
    }

    const query = { ...baseQuery };
    if (andFilters.length) {
      query.$and = andFilters;
    }

    const sortOption = sortMap[sort] || sortMap.recent;
    const numericLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const numericSkip = parseInt(skip, 10) || 0;

    if (view === 'home') {
      sortOption.lastOpenedAt = -1;
    }

    const [files, total, storageStats] = await Promise.all([
      File.find(query).sort(sortOption).skip(numericSkip).limit(numericLimit).lean(),
      File.countDocuments(query),
      File.aggregate([
        { $match: { trashed: false } },
        {
          $group: {
            _id: null,
            totalSize: { $sum: '$sizeMb' },
          },
        },
      ]),
    ]);

    const storageUsedMb = storageStats[0]?.totalSize || 0;
    const quotaMb = 15 * 1024;

    const availableFilters = {
      types: [...new Set(files.map((file) => file.type))],
      people: [
        ...new Set(
          files
            .map((file) => file.sharedWith || [])
            .flat()
            .filter(Boolean)
        ),
      ],
      locations: [...new Set(files.map((file) => file.location))],
    };

    res.json({
      data: files,
      meta: {
        total,
        limit: numericLimit,
        skip: numericSkip,
        availableFilters,
        storage: {
          usedMb: storageUsedMb,
          quotaMb,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/folders', async (req, res, next) => {
  try {
    const folders = await File.find({
      isFolder: true,
      trashed: false,
    })
      .select('name _id parentId')
      .lean();
    res.json(folders);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = normalizeBody(req.body);
    const { parent, error } = await resolveParentFolder(payload.parentId);
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (parent) {
      payload.parentId = parent._id;
      payload.location = parent.location;
    } else {
      payload.parentId = null;
    }
    const file = await File.create(payload);
    res.status(201).json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const now = new Date();
    const body = normalizeBody(req.body);
    const inferredType = body.type || mapMimeToType(req.file.mimetype);
    const { parent, error } = await resolveParentFolder(body.parentId);
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (parent) {
      body.parentId = parent._id;
      body.location = parent.location;
    } else {
      body.parentId = null;
    }

    const fileDoc = await File.create({
      name: body.name || req.file.originalname,
      owner: body.owner || 'Unknown',
      type: inferredType,
      location: body.location || 'My Drive',
      sharedWith: body.sharedWith || [],
      starred: body.starred || false,
      sizeMb: body.sizeMb || Number((req.file.size / (1024 * 1024)).toFixed(2)),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      storagePath: path.posix.join('uploads', req.file.filename),
      isUploaded: true,
      isFolder: false,
      uploadedAt: body.uploadedAt || now,
      lastOpenedAt: body.lastOpenedAt || now,
      parentId: body.parentId,
    });

    res.status(201).json(fileDoc);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/trash', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    file.trashed = true;
    file.location = 'Trash';
    await file.save();
    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    file.trashed = false;
    if (file.location === 'Trash') {
      file.location = 'My Drive';
    }
    await file.save();
    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/star', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    file.starred = !file.starred;
    await file.save();
    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/share', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    const { sharedWith } = req.body;
    if (Array.isArray(sharedWith)) {
      file.sharedWith = sharedWith.filter(Boolean);
      file.location = file.sharedWith.length > 0 ? 'Shared with me' : 'My Drive';
      await file.save();
    }
    
    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/rename', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    const { name } = req.body;
    if (name && name.trim()) {
      file.name = name.trim();
      await file.save();
    }
    
    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/details', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const { description } = req.body;
    file.description = description || '';
    await file.save();

    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/move', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const { parentId, location } = req.body;
    if (parentId !== undefined) {
      if (!parentId) {
        file.parentId = null;
        if (location) {
          file.location = location;
        } else {
          file.location = 'My Drive';
        }
      } else {
        const { parent, error } = await resolveParentFolder(parentId);
        if (error) {
          return res.status(400).json({ message: error });
        }
        file.parentId = parent._id;
        file.location = parent.location;
      }
    } else if (location) {
      file.location = location;
    }
    await file.save();

    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/offline', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    file.availableOffline = !file.availableOffline;
    await file.save();
    res.json(file);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const file = await File.findByIdAndDelete(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;

function normalizeBody(raw = {}) {
  const payload = { ...raw };
  if (typeof payload.sharedWith === 'string') {
    payload.sharedWith = payload.sharedWith
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(payload.sharedWith)) {
    payload.sharedWith = payload.sharedWith.filter(Boolean);
  } else if (!payload.sharedWith) {
    payload.sharedWith = [];
  }

  payload.starred = payload.starred === true || payload.starred === 'true';
  payload.isFolder = payload.type === 'folder' || payload.isFolder === true || payload.isFolder === 'true';
  payload.sizeMb = Number(payload.sizeMb) || 0;
  payload.owner = payload.owner || 'Unknown';
  payload.location = payload.location || 'My Drive';
  if (payload.parentId === '' || payload.parentId === 'root') {
    payload.parentId = null;
  }

  return payload;
}

function normalizeParentFilter(parentId) {
  if (!parentId || parentId === 'root') {
    return { filter: null };
  }
  if (!mongoose.Types.ObjectId.isValid(parentId)) {
    return { filter: null, error: 'Invalid folder id' };
  }
  return { filter: parentId };
}

async function resolveParentFolder(parentId) {
  if (parentId === undefined || parentId === null) {
    return { parent: null };
  }
  const normalized = typeof parentId === 'string' ? parentId.trim() : parentId;
  if (!normalized || normalized === 'root') {
    return { parent: null };
  }
  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    return { parent: null, error: 'Invalid parent folder' };
  }
  const parent = await File.findById(normalized);
  if (!parent || !parent.isFolder || parent.trashed) {
    return { parent: null, error: 'Invalid parent folder' };
  }
  return { parent };
}

function mapMimeToType(mime = '') {
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'spreadsheet';
  if (mime.includes('presentation')) return 'presentation';
  if (mime.includes('word') || mime.includes('document') || mime.includes('text')) return 'document';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('zip') || mime.includes('rar')) return 'archive';
  if (mime.includes('video')) return 'video';
  if (mime.includes('plain')) return 'text';
  return 'document';
}
