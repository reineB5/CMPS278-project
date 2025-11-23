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

/*router.get('/', async (req, res, next) => {
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
      advType = '',
      advOwner = '',
      advContent = '',
      sort = 'recent',
      limit = 20,
      skip = 0,
      parentId,
    } = req.query;

    const baseQuery = { trashed: false };
    const andFilters = [];*/

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
      advType = '',
      advOwner = '',
      advContent = '',
      sort = 'recent',
      limit = 20,
      skip = 0,
      parentId,
    } = req.query;

    const currentUserEmail = req.user?.email ? req.user.email.toLowerCase() : null;
    const baseQuery = { trashed: false };
    const andFilters = [];

    // By default, limit to files owned by the logged-in user
    if (currentUserEmail) {
      baseQuery.owner = currentUserEmail;
    }

    if (view === 'trash') {
      baseQuery.trashed = true;
    }

    if (view === 'shared') {
      // For "Shared with me", show files shared *with* this user
      delete baseQuery.owner; // not owner-based here
      if (currentUserEmail) {
        // MongoDB array query: find documents where sharedWith array contains the email
        // Using $in for explicit array matching
        andFilters.push({ sharedWith: { $in: [currentUserEmail] } });
      }
      // Don't filter by location - shared files can be in "My Drive" from owner's perspective
      // but should appear in "Shared with me" for recipients
    }

    if (view === 'starred') {
      baseQuery.starred = true;
    }


    if (view === 'trash') {
      baseQuery.trashed = true;
    }

    // Don't set location filter for shared view - files shared with user
    // should appear regardless of their location field

    if (view === 'starred') {
      baseQuery.starred = true;
    }

    if (primary === 'files') baseQuery.isFolder = false;
    if (primary === 'folders') baseQuery.isFolder = true;

    const primaryTypeFilter = buildTypeFilter(type);
    if (primaryTypeFilter) {
      andFilters.push(primaryTypeFilter);
    }
    if (people) {
      delete baseQuery.owner;
    }
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

    const typeFilter = buildTypeFilter(advType);
    if (typeFilter) {
      andFilters.push(typeFilter);
    }

    if (advOwner) {
      andFilters.push({ owner: { $regex: advOwner, $options: 'i' } });
    }

    if (people) {
      delete baseQuery.owner; // allow matches beyond my owned files
      const escaped = escapeRegex(String(people).trim());
      const exactMatch = escaped ? new RegExp(`^${escaped}$`, 'i') : null;
      if (exactMatch) {
        andFilters.push({
          $or: [
            { owner: { $regex: exactMatch } },
            { sharedWith: { $elemMatch: { $regex: exactMatch } } },
          ],
        });
      }
    }

    const contentFilter = buildContentFilter(advContent);
    if (contentFilter) {
      andFilters.push(contentFilter);
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

    const storageMatch = { trashed: false };

// limit storage stats to current user’s files
if (currentUserEmail) {
  storageMatch.owner = currentUserEmail;
}

const [files, total, storageStats] = await Promise.all([
  File.find(query).sort(sortOption).skip(numericSkip).limit(numericLimit).lean(),
  File.countDocuments(query),
  File.aggregate([
    { $match: storageMatch },
    {
      $group: {
        _id: null,
        totalSize: { $sum: '$sizeMb' },
        totalBytes: {
          $sum: {
            $cond: [
              { $gt: ['$sizeBytes', 0] },
              '$sizeBytes',
              { $multiply: ['$sizeMb', 1024 * 1024] },
            ],
          },
        },
      },
    },
  ]),
]);

    const storageUsedMb = storageStats[0]?.totalSize || 0;
    const storageUsedBytes = storageStats[0]?.totalBytes || Math.round(storageUsedMb * 1024 * 1024);
    const quotaMb = 15 * 1024;
    const quotaBytes = quotaMb * 1024 * 1024;

    const peopleSet = new Set();
    files.forEach((file) => {
      if (file.owner) peopleSet.add(String(file.owner).toLowerCase());
      (file.sharedWith || []).forEach((p) => {
        if (p) peopleSet.add(String(p).toLowerCase());
      });
    });

    const availableFilters = {
      types: [...new Set(files.map((file) => file.type))],
      people: [...peopleSet],
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
          usedBytes: storageUsedBytes,
          quotaBytes,
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
      payload.location = payload.location || 'My Drive';
    }
    // Force owner to be the logged-in user, normalized to lowercase
    const ownerEmail = req.user?.email || req.user?.username || 'Unknown';
    payload.owner = typeof ownerEmail === 'string' ? ownerEmail.toLowerCase() : ownerEmail;

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
    const inferredType = body.type || mapMimeToType(req.file.mimetype, req.file.originalname);
    const fileSizeBytes = req.file.size;
    const fileSizeMb = Number((fileSizeBytes / (1024 * 1024)).toFixed(2));
    const { parent, error } = await resolveParentFolder(body.parentId);

    if (error) {
      return res.status(400).json({ message: error });
    }

    if (parent) {
      body.parentId = parent._id;
      body.location = parent.location;
    } else {
      body.parentId = null;
      body.location = body.location || 'My Drive';
    }

    const ownerEmail = req.user?.email || req.user?.username || 'Unknown';
    const fileDoc = await File.create({
      name: body.name || req.file.originalname,
      // 🔹 OWNER = currently logged-in user (email or username), normalized to lowercase
      owner: typeof ownerEmail === 'string' ? ownerEmail.toLowerCase() : ownerEmail,
      type: inferredType,
      location: body.location,
      sharedWith: body.sharedWith || [],
      starred: body.starred || false,
      sizeMb: fileSizeMb,
      sizeBytes: fileSizeBytes,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      // 🔹 THIS IS WHAT MAKES IT *NOT* A PLACEHOLDER:
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




/*router.get('/:id', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    res.json(file);
  } catch (error) {
    next(error);
  }
});*/
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
      advContent = '',
      sort = 'recent',
      limit = 20,
      skip = 0,
      parentId,
    } = req.query;

    const rawEmail = req.user?.email || req.user?.username || null;
    const currentUserEmail = rawEmail ? String(rawEmail).toLowerCase() : null;

    const baseQuery = { trashed: false };
    const andFilters = [];

    // 🔹 Only my files for My Drive / default view
    if (currentUserEmail && view !== 'shared' && view !== 'trash') {
      baseQuery.owner = currentUserEmail;
    }

    if (view === 'trash') {
      baseQuery.trashed = true;
    }

    if (view === 'shared') {
      // Files shared *with* me
      delete baseQuery.owner;
      if (currentUserEmail) {
        // MongoDB array query: find documents where sharedWith array contains the email
        // Using $in for explicit array matching
        andFilters.push({ sharedWith: { $in: [currentUserEmail] } });
      }
      // Don't filter by location - shared files can be in "My Drive" from owner's perspective
      // but should appear in "Shared with me" for recipients
    }

    if (view === 'starred') {
      baseQuery.starred = true;
    }

    if (primary === 'files') baseQuery.isFolder = false;
    if (primary === 'folders') baseQuery.isFolder = true;
    const primaryTypeFilter = buildTypeFilter(type);
    if (primaryTypeFilter) {
      andFilters.push(primaryTypeFilter);
    }

    // When filtering by people, allow results beyond just my owned files
    if (people) {
      delete baseQuery.owner;
    }
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
    const typeFilter = buildTypeFilter(advType);
    if (typeFilter) {
      andFilters.push(typeFilter);
    }
    if (people) {
      delete baseQuery.owner; // allow matches beyond my owned files
      const escaped = escapeRegex(String(people).trim());
      const exactMatch = escaped ? new RegExp(`^${escaped}$`, 'i') : null;
      if (exactMatch) {
        andFilters.push({
          $or: [
            { owner: { $regex: exactMatch } },
            { sharedWith: { $elemMatch: { $regex: exactMatch } } },
          ],
        });
      }
    }
    const contentFilter = buildContentFilter(advContent);
    if (contentFilter) {
      andFilters.push(contentFilter);
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

    // 🔹 Use the same query for files & storage (but always ignore trashed in storage)
    const storageMatch = { ...query, trashed: false };

    const [files, total, storageStats] = await Promise.all([
      File.find(query).sort(sortOption).skip(numericSkip).limit(numericLimit).lean(),
      File.countDocuments(query),
      File.aggregate([
        { $match: storageMatch },
        {
          $group: {
            _id: null,
            totalSize: { $sum: '$sizeMb' },
            totalBytes: {
              $sum: {
                $cond: [
                  { $gt: ['$sizeBytes', 0] },
                  '$sizeBytes',
                  { $multiply: ['$sizeMb', 1024 * 1024] },
                ],
              },
            },
          },
        },
      ]),
    ]);

    const storageUsedMb = storageStats[0]?.totalSize || 0;
    const storageUsedBytes =
      storageStats[0]?.totalBytes || Math.round(storageUsedMb * 1024 * 1024);
    const quotaMb = 15 * 1024;
    const quotaBytes = quotaMb * 1024 * 1024;

    const peopleSet = new Set();
    files.forEach((file) => {
      if (file.owner) peopleSet.add(String(file.owner).toLowerCase());
      (file.sharedWith || []).forEach((p) => {
        if (p) peopleSet.add(String(p).toLowerCase());
      });
    });

    const availableFilters = {
      types: [...new Set(files.map((file) => file.type))],
      people: [...peopleSet],
      locations: [...new Set(files.map((file) => file.location))],
    };

    res.json({
      data: files,   // 🔹 includes storagePath, mimeType, isUploaded, etc.
      meta: {
        total,
        limit: numericLimit,
        skip: numericSkip,
        storage: {
          usedMb: storageUsedMb,
          usedBytes: storageUsedBytes,
          quotaMb,
          quotaBytes,
        },
        availableFilters,
      },
    });
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
      // Don't change location - location represents where file is from owner's perspective
      // Shared files should remain in "My Drive" for the owner
      // They appear in "Shared with me" for recipients via query, not location field
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

router.get('/:id/download', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    if (!file.storagePath) {
      return res.status(400).json({ message: 'File has no stored content' });
    }

    const absolutePath = path.join(__dirname, '..', file.storagePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'File content not found on disk' });
    }

    const downloadName = file.originalName || file.name;

    // This sets Content-Disposition: attachment; filename="..."
    res.download(absolutePath, downloadName, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});


router.post('/:id/copy', async (req, res, next) => {
  try {
    const original = await File.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (original.trashed) {
      return res.status(400).json({ message: 'Cannot copy a trashed item' });
    }

    // Base name: "Copy of <name>"
    const baseName = `Copy of ${original.name}`;
    let newName = baseName;
    let counter = 1;

    // Make sure the name is unique in the same folder for the same owner
    while (
      await File.exists({
        owner: original.owner,
        parentId: original.parentId,
        name: newName,
      })
    ) {
      newName = `${baseName} (${counter++})`;
    }

    const now = new Date();

    const copy = await File.create({
      name: newName,
      owner: original.owner,
      type: original.type,
      location: original.location,
      sharedWith: original.sharedWith,
      description: original.description,
      uploadedAt: original.uploadedAt,
      lastOpenedAt: now,
      sizeMb: original.sizeMb,
      sizeBytes: original.sizeBytes,
      isFolder: original.isFolder,
      parentId: original.parentId,
      starred: false,
      trashed: false,
      originalName: original.originalName,
      mimeType: original.mimeType,
      storagePath: original.storagePath,  // reuse same uploaded file
      isUploaded: original.isUploaded,
      availableOffline: false,
    });

    res.status(201).json(copy);
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

router.post('/:id/shortcut', async (req, res, next) => {
  try {
    const targetFile = await File.findById(req.params.id);
    if (!targetFile) return res.status(404).json({ message: 'File not found' });
    
    const { parentId } = req.body;
    const ownerEmail = req.user?.email || req.user?.username || 'Unknown';
    const normalizedOwner = typeof ownerEmail === 'string' ? ownerEmail.toLowerCase() : ownerEmail;
    
    // Resolve parent folder if provided
    let finalParentId = null;
    let location = 'My Drive';
    if (parentId) {
      const { parent, error } = await resolveParentFolder(parentId);
      if (error) {
        return res.status(400).json({ message: error });
      }
      if (parent) {
        finalParentId = parent._id;
        location = parent.location;
      }
    }
    
    // Create shortcut file
    const shortcut = await File.create({
      name: `${targetFile.name} (shortcut)`,
      owner: normalizedOwner,
      type: targetFile.type,
      location: location,
      sharedWith: [],
      description: `Shortcut to ${targetFile.name}`,
      uploadedAt: new Date(),
      lastOpenedAt: new Date(),
      sizeMb: 0,
      sizeBytes: 0,
      isFolder: false,
      parentId: finalParentId,
      starred: false,
      trashed: false,
      isUploaded: false,
      availableOffline: false,
      isShortcut: true,
      shortcutTargetId: targetFile._id,
    });
    
    res.status(201).json(shortcut);
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
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  if (Array.isArray(payload.sharedWith)) {
    payload.sharedWith = payload.sharedWith
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : item))
      .filter(Boolean);
  } else if (!payload.sharedWith) {
    payload.sharedWith = [];
  }

  payload.starred = payload.starred === true || payload.starred === 'true';
  payload.isFolder = payload.type === 'folder' || payload.isFolder === true || payload.isFolder === 'true';
  payload.sizeMb = Number(payload.sizeMb) || 0;
  const parsedBytes = Number(payload.sizeBytes);
  if (Number.isFinite(parsedBytes) && parsedBytes > 0) {
    payload.sizeBytes = parsedBytes;
  } else {
    payload.sizeBytes = Math.round(payload.sizeMb * 1024 * 1024);
  }
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

function mapMimeToType(mime = '', originalName = '') {
  const lowerMime = (mime || '').toLowerCase();
  const name = (originalName || '').toLowerCase();

  const hasExt = (exts) => exts.some((ext) => name.endsWith(`.${ext}`));

  if (lowerMime.includes('spreadsheet') || lowerMime.includes('excel') || hasExt(['xls', 'xlsx', 'csv', 'tsv', 'ods'])) {
    return 'spreadsheet';
  }
  if (
    lowerMime.includes('presentation') ||
    lowerMime.includes('powerpoint') ||
    hasExt(['ppt', 'pptx', 'pps', 'odp'])
  ) {
    return 'presentation';
  }
  if (lowerMime.includes('pdf') || hasExt(['pdf'])) {
    return 'pdf';
  }
  if (lowerMime.includes('zip') || lowerMime.includes('x-rar') || lowerMime.includes('7z') || hasExt(['zip', 'rar', '7z'])) {
    return 'archive';
  }
  if (lowerMime.includes('video') || hasExt(['mp4', 'mov', 'avi', 'mkv', 'webm'])) {
    return 'video';
  }
  if (lowerMime.includes('text') || lowerMime.includes('plain') || hasExt(['txt', 'md', 'rtf'])) {
    return 'text';
  }
  if (
    lowerMime.includes('word') ||
    lowerMime.includes('officedocument.word') ||
    lowerMime.includes('msword') ||
    hasExt(['doc', 'docx', 'odt', 'pages', 'rtf'])
  ) {
    return 'document';
  }

  return 'document';
}

function buildTypeFilter(advType = '') {
  if (!advType) return null;
  const normalized = String(advType).toLowerCase();
  if (normalized === 'folder') {
    return { isFolder: true };
  }

  const typeConfig = {
    document: {
      values: ['document', 'word', 'doc', 'docx', 'officedocument.word', 'msword'],
      exts: ['doc', 'docx', 'odt', 'pages', 'rtf'],
      mimeHints: ['word', 'officedocument.word', 'msword', 'application/vnd.oasis.opendocument.text'],
    },
    spreadsheet: {
      values: ['spreadsheet', 'excel', 'sheet', 'xls', 'xlsx'],
      exts: ['xls', 'xlsx', 'csv', 'tsv', 'ods'],
      mimeHints: ['spreadsheet', 'excel', 'sheet', 'application/vnd.ms-excel', 'application/vnd.oasis.opendocument.spreadsheet'],
    },
    presentation: {
      values: ['presentation', 'powerpoint', 'ppt', 'pptx', 'pps'],
      exts: ['ppt', 'pptx', 'pps', 'odp'],
      mimeHints: ['presentation', 'powerpoint', 'officedocument.presentation', 'application/vnd.ms-powerpoint'],
    },
    pdf: {
      values: ['pdf'],
      exts: ['pdf'],
      mimeHints: ['pdf'],
    },
    archive: {
      values: ['archive', 'zip', 'rar', '7z'],
      exts: ['zip', 'rar', '7z'],
      mimeHints: ['zip', 'x-rar', 'x-7z'],
    },
    text: {
      values: ['text', 'txt', 'md', 'markdown', 'rtf'],
      exts: ['txt', 'md', 'rtf'],
      mimeHints: ['text', 'plain', 'markdown'],
    },
    video: {
      values: ['video', 'mp4', 'mov', 'avi', 'mkv', 'webm'],
      exts: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
      mimeHints: ['video', 'mp4', 'quicktime', 'x-msvideo', 'matroska'],
    },
  };

  const config = typeConfig[normalized];
  if (!config) {
    // fallback to exact type match
    return { type: { $regex: new RegExp(`^${advType}$`, 'i') } };
  }

  const extPattern = config.exts.length ? `\\.(${config.exts.join('|')})$` : null;
  const valuePattern = config.values.length
    ? new RegExp(`(${config.values.map((v) => v.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})`, 'i')
    : null;
  const mimePattern = config.mimeHints.length
    ? new RegExp(`(${config.mimeHints.map((v) => v.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})`, 'i')
    : null;

  const orFilters = [];
  if (valuePattern) {
    orFilters.push({ type: { $regex: valuePattern } });
  }
  if (mimePattern) {
    orFilters.push({ mimeType: { $regex: mimePattern } });
  }
  if (extPattern) {
    orFilters.push(
      { originalName: { $regex: extPattern, $options: 'i' } },
      { name: { $regex: extPattern, $options: 'i' } },
      { storagePath: { $regex: extPattern, $options: 'i' } }
    );
  }

  return orFilters.length ? { $or: orFilters } : null;
}

function escapeRegex(input = '') {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildContentFilter(term = '') {
  if (!term) return null;
  const regex = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [
      { description: { $regex: regex } },
      { content: { $regex: regex } },
      { extractedText: { $regex: regex } },
      { name: { $regex: regex } },
      { originalName: { $regex: regex } },
    ],
  };
}
