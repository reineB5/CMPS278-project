
const TYPE_ICONS = {
  folder:
    '<span class="material-icons file-icon-symbol">folder</span>',

  // Office documents (Word-like)
  document:
    '<span class="material-icons file-icon-symbol">description</span>',

  // Excel-style
  spreadsheet:
    '<span class="material-icons file-icon-symbol">grid_on</span>',

  // PowerPoint-style
  presentation:
    '<span class="material-icons file-icon-symbol">slideshow</span>',

  // PDF
  pdf:
    '<span class="material-icons file-icon-symbol">picture_as_pdf</span>',

  // ZIP / RAR
  archive:
    '<span class="material-icons file-icon-symbol">folder_zip</span>',

  // Plain text files
  text:
    '<span class="material-icons file-icon-symbol">article</span>',

  // Videos
  video:
    '<span class="material-icons file-icon-symbol">movie</span>',
};


const LOCATION_OPTIONS = [
  { value: 'anywhere', label: 'Anywhere in Drive', query: '' },
  { value: 'mydrive', label: 'My Drive', query: 'My Drive' },
  { value: 'shared', label: 'Shared with me', query: 'Shared with me' },
];

const state = {
  context: 'home',
  viewMode: 'list',
  primaryFilter: 'all',
  typeFilter: '',
  peopleFilter: '',
  locationFilter: 'anywhere',
  modifiedFilter: '',
  sort: 'recent',
  searchTerm: '',
  advancedFilters: {},
  selected: new Set(),
  data: [],
  filterOptions: { types: [], people: [], locations: [] },
  storage: {
    usedMb: 0,
    quotaMb: 15 * 1024,
    usedBytes: 0,
    quotaBytes: 15 * 1024 * 1024 * 1024,
  },
  user: null,
  currentFolderId: null,
  folderTrail: [],
  refreshFn: null,
};

document.addEventListener('DOMContentLoaded', () => {
  const fileListEl = document.getElementById('file-list');
  if (!fileListEl) return;

  state.context = document.body.dataset.page || 'home';
  state.currentFolderId = null;
  state.folderTrail = [];

  const viewButtons = document.querySelectorAll('.view-toggle .outline-btn');
  const primaryFilterButtons = document.querySelectorAll('.ff-btn');
  const searchInput = document.getElementById('global-search');
  const filterType = document.getElementById('filter-type');
  const filterPeople = document.getElementById('filter-people');
  const filterLocation = document.getElementById('filter-location');
  const filterModified = document.getElementById('filter-modified');
  const sortSelect = document.getElementById('sort-select');
  const selectionBar = document.getElementById('selection-bar');
  const selectionCount = document.getElementById('selection-count');
  const advancedBtn = document.getElementById('advanced-search-btn');
  const advancedDialog = document.getElementById('advanced-search-dialog');
  const advancedApply = document.getElementById('advanced-search-apply');
  const storageProgress = document.getElementById('storage-progress');
  const storageCopy = document.getElementById('storage-copy');
  const statusBanner = document.createElement('div');
  statusBanner.className = 'list-status';
  fileListEl.parentElement.insertBefore(statusBanner, fileListEl);
  const newFileBtn = document.getElementById('new-file-btn');
  const newFileDialog = document.getElementById('new-file-dialog');
  const newFileForm = document.getElementById('new-file-form');
  const newFileCancel = document.getElementById('new-file-cancel');
  const newFileError = document.getElementById('new-file-error');
  const newFileSubmit = document.getElementById('new-file-submit');
  const newFileUpload = document.getElementById('new-file-upload');
  const newFileUploadRow = document.getElementById('new-file-upload-row');
  const typeSelectInForm = newFileForm?.querySelector('select[name="type"]');
  const sizeInput = newFileForm?.querySelector('input[name="sizeMb"]');
  const nameInput = newFileForm?.querySelector('input[name="name"]');
  const defaultAccept = newFileUpload?.getAttribute('accept') || '';
  const profileElements = getProfileElements();
  const breadcrumb = document.getElementById('folder-breadcrumb');
  fillLocationSelect(filterLocation);
  breadcrumb?.addEventListener('click', (event) => {
    const button = event.target.closest('.breadcrumb-item');
    if (!button || button.disabled) return;
    const index = Number(button.dataset.index);
    if (Number.isNaN(index)) return;
    goToBreadcrumb(index);
  });

  const render = () => {
    renderFiles(state.data, fileListEl);
    populateDynamicFilters();
    updateStorage(storageProgress, storageCopy);
    updateSelectionUI(selectionBar, selectionCount);
    renderBreadcrumb(breadcrumb);
  };

  const refresh = async () => {
    setStatus('Loading...');
    try {
      await loadFiles();
      setStatus(state.data.length ? '' : 'No files match your filters.');
      render();
    } catch (error) {
      console.error(error);
      setStatus('Failed to load files. Please try again.');
    }
  };

  loadCurrentUser(profileElements);
  state.refreshFn = refresh;
  refresh();

  viewButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      updateViewButtons(viewButtons);
      render();
    })
  );

  primaryFilterButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      primaryFilterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.primaryFilter = btn.dataset.type;
      refresh();
    })
  );

  [filterType, filterPeople, filterLocation, filterModified].forEach((select) =>
    select?.addEventListener('change', () => {
      state.typeFilter = filterType?.value || '';
      state.peopleFilter = filterPeople?.value || '';
      state.locationFilter = filterLocation?.value || 'anywhere';
      state.modifiedFilter = filterModified?.value || '';
      refresh();
    })
  );

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    refresh();
  });

  searchInput?.addEventListener('input', () => {
    state.searchTerm = searchInput.value.trim();
    refresh();
  });

  fileListEl.addEventListener('click', (event) => {
    const target = event.target;
    const checkbox = target.closest('.file-select');
    if (checkbox) {
      const row = checkbox.closest('[data-file-id]');
      toggleSelection(row.dataset.fileId, checkbox.checked);
      updateSelectionUI(selectionBar, selectionCount);
      return;
    }

    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      const row = actionBtn.closest('[data-file-id]');
      handleFileAction(actionBtn.dataset.action, row.dataset.fileId);
      return;
    }

    const row = target.closest('[data-file-id]');
    if (row && !target.closest('.kebab') && !target.closest('.file-actions-inline')) {
      openFile(row.dataset.fileId);
    }
  });

  document.addEventListener('click', (event) => {
    const toggleBtn = event.target.closest('.kebab-toggle');
    const insideKebab = event.target.closest('.kebab');
    const submenuItem = event.target.closest('.submenu-item');

    // Handle submenu item clicks
    if (submenuItem && submenuItem.dataset.action) {
      const row = submenuItem.closest('[data-file-id]');
      if (row) {
        handleFileAction(submenuItem.dataset.action, row.dataset.fileId);
        // Close the kebab menu after action
        const kebab = submenuItem.closest('.kebab');
        if (kebab) kebab.classList.remove('open');
        event.stopPropagation();
        return;
      }
    }

    if (toggleBtn && insideKebab) {
      document.querySelectorAll('.kebab.open').forEach((k) => {
        if (k !== insideKebab) k.classList.remove('open');
      });
      insideKebab.classList.toggle('open');
      if (insideKebab.classList.contains('open')) {
        positionKebabMenu(insideKebab);
      }
      event.stopPropagation();
      return;
    }

    if (!insideKebab) {
      document.querySelectorAll('.kebab.open').forEach((k) => k.classList.remove('open'));
    }
  });

  document.querySelectorAll('[data-bulk]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.selected.size) return;
      handleBulkAction(btn.dataset.bulk);
    });
  });

  if (advancedBtn && advancedDialog) {
    advancedBtn.addEventListener('click', () => advancedDialog.showModal());
    advancedApply?.addEventListener('click', (event) => {
      event.preventDefault();
      state.advancedFilters = {
        name: document.getElementById('adv-name')?.value.trim() || '',
        content: document.getElementById('adv-content')?.value.trim() || '',
        owner: document.getElementById('adv-owner')?.value.trim() || '',
        shared: document.getElementById('adv-shared')?.value.trim() || '',
      };
      advancedDialog.close();
      refresh();
    });
  }

  const toggleUploadRow = () => {
    if (!typeSelectInForm || !newFileUploadRow || !newFileUpload) return;
    const isFolderType = typeSelectInForm.value === 'folder';
    newFileUpload.value = '';
    resetSizeInput();

    newFileUpload.removeAttribute('webkitdirectory');
    newFileUpload.removeAttribute('directory');
    newFileUpload.removeAttribute('multiple');
    newFileUpload.setAttribute('accept', defaultAccept);

    if (isFolderType) {
      newFileUpload.removeAttribute('accept');
      newFileUpload.setAttribute('webkitdirectory', '');
      newFileUpload.setAttribute('directory', '');
      newFileUpload.setAttribute('multiple', '');
    }

    newFileUploadRow.style.display = 'flex';
  };

  newFileBtn?.addEventListener('click', () => {
    newFileForm?.reset();
    if (newFileError) newFileError.textContent = '';
    toggleUploadRow();
    newFileDialog?.showModal();
  });

  typeSelectInForm?.addEventListener('change', toggleUploadRow);
  newFileUpload?.addEventListener('change', () => {
    if (!sizeInput) return;
    const files = newFileUpload.files ? Array.from(newFileUpload.files) : [];
    if (files.length) {
      const totalSizeMb = files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
      sizeInput.value = totalSizeMb.toFixed(2);
      sizeInput.readOnly = true;

      const isFolderType = typeSelectInForm?.value === 'folder';
      if (isFolderType && nameInput) {
        const relPath = files[0].webkitRelativePath || files[0].name;
        const folderName = relPath.split('/')[0] || relPath;
        if (!nameInput.value) nameInput.value = folderName;
      } else {
        const guessedType = guessTypeFromFilename(files[0].name);
        if (guessedType && typeSelectInForm) {
          typeSelectInForm.value = guessedType;
        }
      }
    } else {
      resetSizeInput();
    }
  });

  newFileCancel?.addEventListener('click', () => {
    newFileDialog?.close();
  });

  newFileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!newFileForm) return;
    if (newFileError) newFileError.textContent = '';
    if (newFileSubmit) {
      newFileSubmit.disabled = true;
      newFileSubmit.textContent = 'Creating...';
    }

    const formData = new FormData(newFileForm);
    const type = formData.get('type');
    const payload = {
      name: formData.get('name'),
      type,
      owner: formData.get('owner'),
      location: formData.get('location'),
      sizeMb: Number(formData.get('sizeMb')) || 0,
      sharedWith: (formData.get('sharedWith') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      starred: formData.get('starred') === 'on',
      isFolder: type === 'folder',
      uploadedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      parentId: getCurrentFolderId(),
    };

    const selectedFiles = newFileUpload?.files ? Array.from(newFileUpload.files) : [];

    if (payload.isFolder) {
      payload.type = 'folder';
      payload.sizeMb = 0;
    }

    try {
      if (payload.isFolder) {
        const folderId = await createFolderWithContents(payload, selectedFiles);
        if (!folderId && selectedFiles.length) {
          throw new Error('Failed to upload folder contents.');
        }
      } else {
        const selectedFile = selectedFiles[0];
        let response;

        if (selectedFile && !payload.isFolder) {
          const uploadData = new FormData();
          uploadData.append('file', selectedFile);
          uploadData.append('name', payload.name);
          uploadData.append('type', payload.type);
          uploadData.append('owner', payload.owner);
          uploadData.append('location', payload.location);
          uploadData.append('sizeMb', payload.sizeMb);
          uploadData.append('sharedWith', payload.sharedWith.join(','));
          uploadData.append('starred', payload.starred);
          uploadData.append('parentId', getCurrentFolderId() || '');
          response = await fetch('/api/files/upload', {
            method: 'POST',
            body: uploadData,
          });
        } else {
          response = await fetch('/api/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to create item.');
        }
        newFileForm.reset();
        if (newFileUpload) newFileUpload.value = '';
        resetSizeInput();
        newFileDialog?.close();
        await refresh();
      }
    } catch (error) {
      if (newFileError) {
        newFileError.textContent = error.message || 'Unable to create item.';
      }
    } finally {
      if (newFileSubmit) {
        newFileSubmit.disabled = false;
        newFileSubmit.textContent = 'Create';
      }
    }
  });

  function setStatus(message) {
    statusBanner.textContent = message;
    statusBanner.style.display = message ? 'block' : 'none';
  }

  function resetSizeInput() {
    if (!sizeInput) return;
    sizeInput.readOnly = false;
    sizeInput.value = '';
  }

  async function createFolderWithContents(payload, files = []) {
    // Create the root folder
    const folderResponse = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!folderResponse.ok) {
      const body = await folderResponse.json().catch(() => ({}));
      throw new Error(body.message || 'Failed to create folder.');
    }
    const folderBody = await folderResponse.json().catch(() => ({}));
    const folderId =
      folderBody?.data?._id ||
      folderBody?.data?.id ||
      folderBody?._id ||
      folderBody?.id ||
      null;

    if (!files.length || !folderId) {
      return folderId;
    }

    for (const file of files) {
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('name', file.name);
      uploadData.append('type', guessTypeFromFilename(file.name) || payload.type || 'document');
      uploadData.append('owner', payload.owner);
      uploadData.append('location', payload.location);
      uploadData.append('sizeMb', (file.size / (1024 * 1024)).toFixed(2));
      uploadData.append('sharedWith', (payload.sharedWith || []).join(','));
      uploadData.append('starred', payload.starred);
      uploadData.append('parentId', folderId);

      const uploadResponse = await fetch('/api/files/upload', {
        method: 'POST',
        body: uploadData,
      });

      if (!uploadResponse.ok) {
        const body = await uploadResponse.json().catch(() => ({}));
        throw new Error(body.message || `Failed to upload ${file.name}`);
      }
    }

    return folderId;
  }

  function guessTypeFromFilename(name) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (!ext) return '';
    if (['doc', 'docx'].includes(ext)) return 'document';
    if (['xls', 'xlsx'].includes(ext)) return 'spreadsheet';
    if (['txt', 'md', 'csv', 'rtf'].includes(ext)) return 'text';
    if (['zip', 'rar', '7z'].includes(ext)) return 'archive';
    if (ext === 'pdf') return 'pdf';
    if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) return 'video';
    return '';
  }

  // Share dialog setup
  const shareDialog = document.getElementById('share-dialog');
  const shareForm = document.getElementById('share-form');
  const shareFileName = document.getElementById('share-file-name');
  const shareCurrentList = document.getElementById('share-current-list');
  const shareEmailInput = document.getElementById('share-email-input');
  const shareError = document.getElementById('share-error');
  const shareCancel = document.getElementById('share-cancel');
  const shareAdd = document.getElementById('share-add');
  const shareSave = document.getElementById('share-save');
  let currentShareFileId = null;
  let currentShareList = [];

  shareCancel?.addEventListener('click', () => {
    shareDialog?.close();
    shareEmailInput.value = '';
    if (shareError) shareError.textContent = '';
  });

  shareAdd?.addEventListener('click', () => {
    const emails = shareEmailInput.value
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    emails.forEach((email) => {
      if (!currentShareList.includes(email)) {
        currentShareList.push(email);
      }
    });
    shareEmailInput.value = '';
    renderShareList();
  });

  shareSave?.addEventListener('click', async () => {
    if (!currentShareFileId) return;
    if (shareError) shareError.textContent = '';
    if (shareSave) {
      shareSave.disabled = true;
      shareSave.textContent = 'Saving...';
    }

    try {
      const response = await fetch(`/api/files/${currentShareFileId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedWith: currentShareList }),
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to share file.');
      }
      shareDialog?.close();
      shareEmailInput.value = '';
      await refresh();
    } catch (error) {
      if (shareError) {
        shareError.textContent = error.message || 'Unable to share file.';
      }
    } finally {
      if (shareSave) {
        shareSave.disabled = false;
        shareSave.textContent = 'Save';
      }
    }
  });

  function renderShareList() {
    if (!shareCurrentList) return;
    shareCurrentList.innerHTML = '';
    if (currentShareList.length === 0) {
      shareCurrentList.innerHTML = '<p style="color: #5f6368; font-size: 13px;">No one has access</p>';
      return;
    }
    currentShareList.forEach((email) => {
      const item = document.createElement('div');
      item.className = 'share-person-item';
      item.innerHTML = `
        <span>${email}</span>
        <button type="button" data-remove="${email}">Remove</button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        currentShareList = currentShareList.filter((e) => e !== email);
        renderShareList();
      });
      shareCurrentList.appendChild(item);
    });
  }

  window.openShareDialog = (fileId) => {
    const file = state.data.find((f) => f.id === fileId);
    if (!file) return;
    currentShareFileId = fileId;
    currentShareList = [...(file.sharedWith || [])];
    if (shareFileName) shareFileName.textContent = file.name;
    renderShareList();
    shareDialog?.showModal();
  };

  // Rename dialog setup
  const renameDialog = document.getElementById('rename-dialog');
  const renameInput = document.getElementById('rename-input');
  const renameError = document.getElementById('rename-error');
  const renameCancel = document.getElementById('rename-cancel');
  const renameSave = document.getElementById('rename-save');
  let currentRenameFileId = null;

  renameCancel?.addEventListener('click', () => {
    renameDialog?.close();
    if (renameInput) renameInput.value = '';
    if (renameError) renameError.textContent = '';
  });

  renameSave?.addEventListener('click', async () => {
    if (!currentRenameFileId || !renameInput) return;
    const newName = renameInput.value.trim();
    if (!newName) {
      if (renameError) renameError.textContent = 'Name cannot be empty.';
      return;
    }

    if (renameError) renameError.textContent = '';
    if (renameSave) {
      renameSave.disabled = true;
      renameSave.textContent = 'Saving...';
    }

    try {
      const response = await fetch(`/api/files/${currentRenameFileId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to rename file.');
      }
      renameDialog?.close();
      if (renameInput) renameInput.value = '';
      await refresh();
    } catch (error) {
      if (renameError) {
        renameError.textContent = error.message || 'Unable to rename file.';
      }
    } finally {
      if (renameSave) {
        renameSave.disabled = false;
        renameSave.textContent = 'Save';
      }
    }
  });

  window.openRenameDialog = (fileId) => {
    const file = state.data.find((f) => f.id === fileId);
    if (!file) return;
    currentRenameFileId = fileId;
    if (renameInput) renameInput.value = file.name;
    if (renameError) renameError.textContent = '';
    renameDialog?.showModal();
  };

  // Details dialog setup
  const detailsDialog = document.getElementById('details-dialog');
  const detailsContent = document.getElementById('details-content');
  const detailsDescription = document.getElementById('details-description');
  const detailsError = document.getElementById('details-error');
  const detailsCancel = document.getElementById('details-cancel');
  const detailsSave = document.getElementById('details-save');
  let currentDetailsFileId = null;

  detailsCancel?.addEventListener('click', () => {
    detailsDialog?.close();
    if (detailsError) detailsError.textContent = '';
  });

  detailsSave?.addEventListener('click', async () => {
    if (!currentDetailsFileId || !detailsDescription) return;
    if (detailsError) detailsError.textContent = '';
    if (detailsSave) {
      detailsSave.disabled = true;
      detailsSave.textContent = 'Saving...';
    }
    try {
      const response = await fetch(`/api/files/${currentDetailsFileId}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: detailsDescription.value }),
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update details.');
      }
      detailsDialog?.close();
      await refresh();
    } catch (error) {
      if (detailsError) {
        detailsError.textContent = error.message || 'Unable to save details.';
      }
    } finally {
      if (detailsSave) {
        detailsSave.disabled = false;
        detailsSave.textContent = 'Save';
      }
    }
  });

  window.openDetailsDialog = (fileId) => {
    const file = state.data.find((f) => f.id === fileId);
    if (!file || !detailsDialog) return;
    currentDetailsFileId = fileId;
    if (detailsContent) {
      detailsContent.innerHTML = `
        <span class="label">Name</span><span>${file.name}</span>
        <span class="label">Type</span><span>${file.type}</span>
        <span class="label">Owner</span><span>${file.owner}</span>
        <span class="label">Location</span><span>${file.location}</span>
        <span class="label">Uploaded</span><span>${formatDate(file.uploadedAt)}</span>
        <span class="label">Size</span><span>${formatSize(file.sizeMb)}</span>
        <span class="label">Shared with</span><span>${(file.sharedWith || []).join(', ') || 'Only you'}</span>
      `;
    }
    if (detailsDescription) {
      detailsDescription.value = file.description || '';
    }
    if (detailsError) detailsError.textContent = '';
    detailsDialog.showModal();
  };

  // Move dialog setup
  const moveDialog = document.getElementById('move-dialog');
  const moveFileName = document.getElementById('move-file-name');
  const moveFolderSelect = document.getElementById('move-folder-select');
  const moveError = document.getElementById('move-error');
  const moveCancel = document.getElementById('move-cancel');
  const moveSave = document.getElementById('move-save');
  let currentMoveFileIds = [];

  moveCancel?.addEventListener('click', () => {
    moveDialog?.close();
    if (moveError) moveError.textContent = '';
  });

  moveSave?.addEventListener('click', async () => {
    if (!currentMoveFileIds.length || !moveFolderSelect) return;
    if (moveError) moveError.textContent = '';
    if (moveSave) {
      moveSave.disabled = true;
      moveSave.textContent = 'Moving...';
    }

    try {
      const parentId = moveFolderSelect.value || null;
      const response = await fetch(`/api/files/${currentMoveFileId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to move file.');
      }
      moveDialog?.close();
      await refresh();
    } catch (error) {
      if (moveError) {
        moveError.textContent = error.message || 'Unable to move file.';
      }
    } finally {
      if (moveSave) {
        moveSave.disabled = false;
        moveSave.textContent = 'Move';
      }
    }
  });

  async function loadFolders() {
    try {
      const response = await fetch('/api/files/folders', {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Failed to load folders');
      return await response.json();
    } catch (error) {
      console.error('Failed to load folders', error);
      return [];
    }
  }

  window.openMoveDialog = async (fileIds) => {
    const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
    const validFiles = ids
      .map((id) => state.data.find((f) => f.id === id))
      .filter(Boolean);
    if (!validFiles.length || !moveDialog) return;
    currentMoveFileIds = validFiles.map((f) => f.id);
    if (moveFileName) {
      moveFileName.textContent =
        validFiles.length === 1 ? validFiles[0].name : `${validFiles.length} items`;
    }
    if (moveError) moveError.textContent = '';

    // Load folders and populate select
    const folders = await loadFolders();
    if (moveFolderSelect) {
      moveFolderSelect.innerHTML = '<option value="">My Drive</option>';
      folders.forEach((folder) => {
        if (folder._id !== fileId) {
          const option = document.createElement('option');
          option.value = folder._id;
          option.textContent = folder.name;
          if (file.parentId && folder._id === file.parentId.toString()) {
            option.selected = true;
          }
          moveFolderSelect.appendChild(option);
        }
      });
    }

    moveDialog.showModal();
  };

  // Shortcut dialog setup
  const shortcutDialog = document.getElementById('shortcut-dialog');
  const shortcutFileName = document.getElementById('shortcut-file-name');
  const shortcutFolderSelect = document.getElementById('shortcut-folder-select');
  const shortcutError = document.getElementById('shortcut-error');
  const shortcutCancel = document.getElementById('shortcut-cancel');
  const shortcutCreate = document.getElementById('shortcut-create');
  let currentShortcutFileId = null;

  shortcutCancel?.addEventListener('click', () => {
    shortcutDialog?.close();
    if (shortcutError) shortcutError.textContent = '';
  });

  shortcutCreate?.addEventListener('click', async () => {
    if (!currentShortcutFileId || !shortcutFolderSelect) return;
    if (shortcutError) shortcutError.textContent = '';
    if (shortcutCreate) {
      shortcutCreate.disabled = true;
      shortcutCreate.textContent = 'Creating...';
    }

    try {
      const parentId = shortcutFolderSelect.value || null;
      const response = await fetch(`/api/files/${currentShortcutFileId}/shortcut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to create shortcut.');
      }
      shortcutDialog?.close();
      await refresh();
    } catch (error) {
      if (shortcutError) {
        shortcutError.textContent = error.message || 'Unable to create shortcut.';
      }
    } finally {
      if (shortcutCreate) {
        shortcutCreate.disabled = false;
        shortcutCreate.textContent = 'Add shortcut';
      }
    }
  });

  window.openShortcutDialog = async (fileId) => {
    const file = state.data.find((f) => f.id === fileId);
    if (!file || !shortcutDialog) return;
    currentShortcutFileId = fileId;
    if (shortcutFileName) shortcutFileName.textContent = file.name;
    if (shortcutError) shortcutError.textContent = '';

    // Load folders and populate select
    const folders = await loadFolders();
    if (shortcutFolderSelect) {
      shortcutFolderSelect.innerHTML = '<option value="">My Drive</option>';
      folders.forEach((folder) => {
        const option = document.createElement('option');
        option.value = folder._id;
        option.textContent = folder.name;
      });
    }

    shortcutDialog.showModal();
  };

  // Delete dialog setup
  const deleteDialog = document.getElementById('delete-dialog');
  const deleteMessage = document.getElementById('delete-message');
  const deleteCancel = document.getElementById('delete-cancel');
  const deleteConfirm = document.getElementById('delete-confirm');
  let pendingDeleteIds = [];

  deleteCancel?.addEventListener('click', () => {
    deleteDialog?.close();
    pendingDeleteIds = [];
  });

  deleteConfirm?.addEventListener('click', async () => {
    if (pendingDeleteIds.length > 0) {
      await deleteForever(pendingDeleteIds);
      deleteDialog?.close();
      pendingDeleteIds = [];
    }
  });

  window.openDeleteDialog = (ids, fileNames = []) => {
    if (!deleteDialog) return;
    pendingDeleteIds = Array.isArray(ids) ? ids : [ids];
    
    if (pendingDeleteIds.length === 1) {
      const fileName = fileNames[0] || state.data.find(f => f.id === pendingDeleteIds[0])?.name || 'item';
      if (deleteMessage) {
        deleteMessage.textContent = `Permanently delete "${fileName}"? This action cannot be undone. This will permanently delete the item and remove it from all folders.`;
      }
    } else {
      if (deleteMessage) {
        deleteMessage.textContent = `Permanently delete ${pendingDeleteIds.length} items? This action cannot be undone. This will permanently delete the items and remove them from all folders.`;
      }
    }
    
    deleteDialog.showModal();
  };
});

async function loadFiles() {
  const params = new URLSearchParams({
    view: getViewParam(),
    primary: state.primaryFilter,
    sort: state.sort,
    search: state.searchTerm,
    type: state.typeFilter,
    people: state.peopleFilter,
    location: getLocationQueryValue(),
    modified: state.modifiedFilter,
    parentId: getParentQueryParam(),
    advName: state.advancedFilters.name || '',
    advOwner: state.advancedFilters.owner || '',
    advShared: state.advancedFilters.shared || '',
    advContent: state.advancedFilters.content || '',
  });

  const response = await fetch(`/api/files?${params.toString()}`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    if (response.status === 400 && (state.currentFolderId || state.folderTrail.length)) {
      state.currentFolderId = null;
      state.folderTrail = [];
      return loadFiles();
    }
    throw new Error('Failed to fetch files');
  }
  const payload = await response.json();
  let data = (payload.data || []).map(normalizeFile).filter(applyAdvancedFilters);

  // Home root shows 20 most recent; inside folders show actual contents
  if (state.context === 'home' && !state.currentFolderId) {
    data = data
      .slice()
      .sort((a, b) => new Date(b.lastOpenedAt || b.uploadedAt || 0) - new Date(a.lastOpenedAt || a.uploadedAt || 0))
      .slice(0, 20);
  }

  state.data = data;
  state.filterOptions = payload.meta?.availableFilters || state.filterOptions;
  state.storage = payload.meta?.storage || state.storage;
  const availableIds = new Set(state.data.map((file) => file.id));
  state.selected.forEach((id) => {
    if (!availableIds.has(id)) state.selected.delete(id);
  });
}

function normalizeFile(file) {
  return {
    id: file._id,
    name: file.name,
    owner: file.owner,
    type: file.type,
    location: file.location,
    sharedWith: file.sharedWith || [],
    uploadedAt: file.uploadedAt,
    lastOpenedAt: file.lastOpenedAt,
    sizeMb: file.sizeMb,
    isFolder: file.isFolder,
    description: file.description,
    storagePath: file.storagePath,
    originalName: file.originalName,
    mimeType: file.mimeType,
    isUploaded: file.isUploaded,
    starred: file.starred || false,
    availableOffline: file.availableOffline || false,
    parentId: file.parentId || null,
    isShortcut: file.isShortcut || false,
    shortcutTargetId: file.shortcutTargetId || null,
  };
}

function applyAdvancedFilters(file) {
  const { name = '', owner = '', shared = '', content = '' } = state.advancedFilters;
  const matchesName = !name || (file.name || '').toLowerCase().includes(name.toLowerCase());
  const matchesOwner = !owner || (file.owner || '').toLowerCase().includes(owner.toLowerCase());
  const matchesShared =
    !shared ||
    (file.sharedWith || []).some((p) => (p || '').toLowerCase().includes(shared.toLowerCase()));

  const contentHaystack =
    file.content ||
    file.extractedText ||
    file.description ||
    file.originalName ||
    '';
  const matchesContent =
    !content || contentHaystack.toLowerCase().includes(content.toLowerCase());

  return matchesName && matchesOwner && matchesShared && matchesContent;
}

function populateDynamicFilters() {
  const { types, people } = state.filterOptions;
  fillSelect(document.getElementById('filter-type'), types);
  fillSelect(document.getElementById('filter-people'), people);
  fillLocationSelect(document.getElementById('filter-location'));
}

function fillSelect(select, options = []) {
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">All</option>`;
  options.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    select.appendChild(opt);
  });
  if (options.includes(currentValue)) {
    select.value = currentValue;
  }
}

function fillLocationSelect(select) {
  if (!select) return;
  select.innerHTML = '';
  LOCATION_OPTIONS.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  });
  const fallback = LOCATION_OPTIONS[0]?.value || 'anywhere';
  const allowedValues = LOCATION_OPTIONS.map((opt) => opt.value);
  if (allowedValues.includes(state.locationFilter)) {
    select.value = state.locationFilter;
  } else {
    select.value = fallback;
    state.locationFilter = fallback;
  }
}

function renderFiles(files, container) {
  container.innerHTML = '';
  container.classList.toggle('grid-view', state.viewMode === 'grid');
  container.classList.toggle('list-view', state.viewMode === 'list');

  files.forEach((file) => {
    const isSelected = state.selected.has(file.id);
    const element =
      state.viewMode === 'grid' ? createGridCard(file, isSelected) : createListRow(file, isSelected);
    container.appendChild(element);
  });
}

function renderBreadcrumb(container) {
  if (!container) return;
  const shouldShow = state.context === 'mydrive' || state.folderTrail.length > 0;
  if (!shouldShow) {
    container.classList.remove('visible');
    container.innerHTML = '';
    return;
  }

  container.classList.add('visible');
  container.innerHTML = '';
  const rootLabel = getBreadcrumbRootLabel();
  const crumbs = [{ id: null, name: rootLabel }, ...state.folderTrail];
  crumbs.forEach((crumb, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'breadcrumb-item';
    button.textContent = crumb.name;
    button.dataset.index = String(index);
    if (index === crumbs.length - 1) {
      button.disabled = true;
    }
    container.appendChild(button);
    if (index < crumbs.length - 1) {
      const divider = document.createElement('span');
      divider.className = 'breadcrumb-separator';
      divider.textContent = '›';
      container.appendChild(divider);
    }
  });
}

function createListRow(file, selected) {
  const row = document.createElement('div');
  row.className = `file-row${selected ? ' selected' : ''}`;
  row.dataset.fileId = file.id;

  const shortcutIndicator = file.isShortcut ? '<span class="material-icons" style="font-size: 16px; color: #5f6368; margin-left: 4px;" title="Shortcut">link</span>' : '';

  row.innerHTML = `
    <div class="file-checkbox">
      <input type="checkbox" class="file-select" ${selected ? 'checked' : ''} aria-label="Select ${file.name}">
    </div>
    <div class="file-main">
      <span class="file-icon">${getIcon(file)}</span>
      <div>
        <div class="file-name">${file.name}${shortcutIndicator}</div>
        <div class="file-meta">${file.location}</div>
      </div>
    </div>
    <div class="file-owner">${file.owner}</div>
    <div class="file-date">${formatDate(file.uploadedAt)}</div>
    <div class="file-location">${file.location}</div>
    <div class="file-actions-inline">
      ${renderInlineActions(file)}
    </div>
  `;

  return row;
}

function createGridCard(file, selected) {
  const card = document.createElement('div');
  card.className = `grid-card${selected ? ' selected' : ''}`;
  card.dataset.fileId = file.id;

  const shortcutIndicator = file.isShortcut ? '<span class="material-icons" style="font-size: 16px; color: #5f6368; margin-left: 4px;" title="Shortcut">link</span>' : '';

  card.innerHTML = `
    <div class="grid-card-header">
      <div class="file-checkbox">
        <input type="checkbox" class="file-select" ${selected ? 'checked' : ''} aria-label="Select ${file.name}">
      </div>
      <div class="file-main">
        <span class="file-icon">${getIcon(file)}</span>
        <div>
          <div class="file-name">${file.name}${shortcutIndicator}</div>
          <div class="file-meta">${file.location}</div>
        </div>
      </div>
    </div>
    <div class="file-actions-inline">
      ${renderInlineActions(file)}
    </div>
  `;

  return card;
}

function renderInlineActions(file) {
  const isTrashPage = state.context === 'trash';
  const starTitle = file.starred ? 'Remove from Starred' : 'Add to Starred';
  const starIconName = file.starred ? 'star' : 'star_border';

  const kebabMenuItems = isTrashPage
    ? `
        <div class="menu-item" data-action="details">
          <span class="material-icons icon">info</span>
          <span class="label">View details</span>
        </div>
        <div class="menu-item" data-action="restore">
          <span class="material-icons icon">restore_from_trash</span>
          <span class="label">Restore</span>
        </div>
        <div class="menu-item" data-action="delete">
          <span class="material-icons icon">delete_forever</span>
          <span class="label">Delete forever</span>
        </div>
      `
    : `
        <!-- Open with submenu -->
        <div class="menu-item submenu" data-action="open-with">
          <span class="material-icons icon">open_in_new</span>
          <span class="label">Open with</span>
          <span class="material-icons arrow">chevron_right</span>
          <div class="submenu-menu">
            <div class="submenu-item" data-action="open-default">Open</div>
            <div class="submenu-item" data-action="open-new-window">Open in new window</div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Download / Rename / Make a copy -->
        <div class="menu-item" data-action="download">
          <span class="material-icons icon">download</span>
          <span class="label">Download</span>
        </div>

        <div class="menu-item" data-action="rename">
          <span class="material-icons icon">drive_file_rename_outline</span>
          <span class="label">Rename</span>
        </div>

        <div class="menu-item" data-action="make-copy">
          <span class="material-icons icon">content_copy</span>
          <span class="label">Make a copy</span>
          <span class="shortcut">Ctrl+C Ctrl+V</span>
        </div>

        <div class="divider"></div>

        <!-- Share submenu -->
        <div class="menu-item submenu" data-action="share">
          <span class="material-icons icon">person_add</span>
          <span class="label">Share</span>
          <span class="material-icons arrow">chevron_right</span>
          <div class="submenu-menu">
            <div class="submenu-item" data-action="share-people">Share…</div>
            <div class="submenu-item" data-action="share-link">Copy link</div>
          </div>
        </div>

        <!-- Organize submenu -->
        <div class="menu-item submenu" data-action="organize">
          <span class="material-icons icon">folder_open</span>
          <span class="label">Organize</span>
          <span class="material-icons arrow">chevron_right</span>
          <div class="submenu-menu">
            <div class="submenu-item" data-action="move">
              Move to…
            </div>
            <div class="submenu-item" data-action="add-shortcut">
              Add shortcut to Drive
            </div>
          </div>
        </div>

        <!-- File information submenu -->
        <div class="menu-item submenu" data-action="details">
          <span class="material-icons icon">info</span>
          <span class="label">File information</span>
          <span class="material-icons arrow">chevron_right</span>
          <div class="submenu-menu">
            <div class="submenu-item" data-action="details-pane">Details</div>
            <div class="submenu-item" data-action="activity-pane">Activity</div>
          </div>
        </div>

        <!-- Make available offline -->
        <div class="menu-item" data-action="offline">
          <span class="material-icons icon">offline_pin</span>
          <span class="label">Make available offline</span>
        </div>

        <div class="divider"></div>

        <!-- Move to trash / Not a helpful suggestion -->
        <div class="menu-item" data-action="trash">
          <span class="material-icons icon">delete</span>
          <span class="label">Move to trash</span>
        </div>

        <div class="menu-item" data-action="not-helpful">
          <span class="material-icons icon">thumb_down</span>
          <span class="label">Not a helpful suggestion</span>
        </div>
      `;

  return `
    <button class="icon-btn" data-action="share" title="Share">
      <span class="material-icons">person_add</span>
    </button>
    <button class="icon-btn" data-action="download" title="Download">
      <span class="material-icons">download</span>
    </button>
    <button class="icon-btn" data-action="rename" title="Rename">
      <span class="material-icons">drive_file_rename_outline</span>
    </button>
    <button class="icon-btn" data-action="star" title="${starTitle}">
      <span class="material-icons">${starIconName}</span>
    </button>
    <div class="kebab">
      <button class="icon-btn kebab-toggle" aria-label="More options">
        <span class="material-icons">more_vert</span>
      </button>
      <div class="kebab-menu">
        ${kebabMenuItems}
      </div>
    </div>
  `;
}










function toggleSelection(id, isSelected) {
  if (isSelected) {
    state.selected.add(id);
  } else {
    state.selected.delete(id);
  }
  document
    .querySelectorAll(`[data-file-id="${id}"] .file-select`)
    .forEach((el) => (el.checked = state.selected.has(id)));
  document
    .querySelectorAll(`[data-file-id="${id}"]`)
    .forEach((row) =>
      state.selected.has(id) ? row.classList.add('selected') : row.classList.remove('selected')
    );
}

function updateSelectionUI(bar, counterEl) {
  if (!bar || !counterEl) return;
  const size = state.selected.size;
  counterEl.textContent = size;
  bar.classList.toggle('hidden', size === 0);
  const singleOnly = size === 1;
  bar.querySelectorAll('[data-requires-single]').forEach((el) => {
    el.classList.toggle('disabled', !singleOnly);
    if ('disabled' in el) {
      el.disabled = !singleOnly;
    }
  });
  const moveBtn = bar.querySelector('[data-bulk="move"]');
  const deleteBtn = bar.querySelector('[data-bulk="delete"]');
  if (moveBtn) moveBtn.textContent = state.context === 'trash' ? 'Restore' : 'Move';
  if (deleteBtn) deleteBtn.textContent = state.context === 'trash' ? 'Delete forever' : 'Delete';
}

function updateViewButtons(btns) {
  btns.forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.view === state.viewMode ? 'true' : 'false');
  });
}

function positionKebabMenu(kebabEl) {
  const menu = kebabEl?.querySelector('.kebab-menu');
  if (!menu) return;
  // Reset first
  menu.style.left = '';
  menu.style.right = '';
  menu.style.marginLeft = '';
  menu.style.marginRight = '';

  const padding = 8;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth - padding) {
    // Flip to align left of the toggle so it stays on-screen
    menu.style.right = '0';
    menu.style.left = 'auto';
  } else if (rect.left < padding) {
    // Ensure it doesn't disappear on the far left
    menu.style.left = '0';
    menu.style.right = 'auto';
  }
}

function copyShareLink(file) {
  if (!file) return;
  const link =
    file.storagePath && file.storagePath.trim()
      ? `${window.location.origin}/${file.storagePath}`
      : `${window.location.origin}/files/${file.id}`;

  const notifyCopied = () => alert(`Link copied to clipboard:\n${link}`);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(notifyCopied).catch(() => {
      notifyCopied();
    });
  } else {
    notifyCopied();
  }
}

function handleFileAction(action, fileId) {
  const file = state.data.find((item) => item.id === fileId);
  if (!file) return;
  console.log(`Action ${action} on ${file.name}`);

  // --- OPEN / PREVIEW-LIKE ACTIONS ---

  // "Open with" & "Open" submenu entries -> just open the file
  if (action === 'open-with' || action === 'open-default') {
    openFile(fileId);
    return;
  }

  // Open in new window: prefer storagePath, otherwise fallback to openFile
  if (action === 'open-new-window') {
    if (file.storagePath) {
      window.open(`/${file.storagePath}`, '_blank');
    } else {
      openFile(fileId);
    }
    return;
  }

  // Existing download action
  if (action === 'download') {
  // Force a real download from the backend
  window.location.href = `/api/files/${fileId}/download`;
  return;
}


  // --- TRASH / DELETE / RESTORE ---

  if (action === 'trash') {
    moveToTrash([fileId]);
    return;
  }

  if (action === 'restore') {
    restoreFiles([fileId]);
    return;
  }

  if (action === 'delete') {
    if (state.context === 'trash') {
      window.openDeleteDialog([fileId], [file.name]);
    } else {
      deleteForever([fileId]);
    }
    return;
  }

  // --- STAR / OFFLINE ---

  if (action === 'star') {
    toggleStar(fileId);
    return;
  }

  if (action === 'offline') {
    toggleOffline(fileId);
    return;
  }

  // --- SHARE & SUBMENU VARIANTS ---

  if (action === 'share' || action === 'share-people') {
    openShareDialog(fileId);
    return;
  }

  if (action === 'share-link') {
    copyShareLink(file);
    return;
  }

  // --- RENAME / MOVE / ORGANIZE ---

  if (action === 'rename') {
    openRenameDialog(fileId);
    return;
  }

  // "Move to…" and "Organize" submenu both open the move dialog
  if (action === 'move' || action === 'organize') {
    openMoveDialog(fileId);
    return;
  }

  // "Add shortcut to Drive"
  if (action === 'add-shortcut') {
    openShortcutDialog(fileId);
    return;
  }

  // --- DETAILS / ACTIVITY ---

  // All of these just open the existing details dialog
  if (action === 'details' || action === 'details-pane' || action === 'activity-pane') {
    openDetailsDialog(fileId);
    return;
  }

  // --- MAKE A COPY / NOT HELPFUL ---

  if (action === 'make-copy') {
     makeCopy(fileId);
    return;
  }

  if (action === 'not-helpful') {
    alert('Thanks for the feedback! (No ML here, just vibes 🫶)');
    return;
  }

  // Fallback for anything we forgot to handle
  console.warn('Unhandled file action:', action, 'for file', file);
}




async function openFile(fileId) {
  const file = state.data.find((item) => item.id === fileId);
  if (!file) return;

  // If this is a shortcut, open the target file instead
  if (file.isShortcut && file.shortcutTargetId) {
    openFile(file.shortcutTargetId);
    return;
  }

  if (file.isFolder) {
    enterFolder(file);
    return;
  }

  // If we have an offline copy, use the offline URL (handled by SW)
  if (file.availableOffline) {
    window.open(`/offline/files/${file.id}`, '_blank');
    return;
  }

  const filename = (file.originalName || file.name || '').toLowerCase();
  const officeExts = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
  const isOfficeDoc = officeExts.some((ext) => filename.endsWith(ext));

  const directUrl = file.storagePath
    ? `${window.location.origin}/${file.storagePath}`
    : `${window.location.origin}/api/files/${file.id}/download`;

  // Stream the file and open via an object URL to avoid forced downloads
  // (browsers may still download if they can't render the format)
  await openBlobPreview(file, file.storagePath ? `/${file.storagePath}` : `/api/files/${file.id}/download`);
}

async function openBlobPreview(file, url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Preview failed');
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const newWindow = window.open(objectUrl, '_blank');
    if (!newWindow) {
      // Fallback to same-tab navigation if pop-ups are blocked
      window.location.href = objectUrl;
    } else {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
  } catch (error) {
    console.error('Preview failed, falling back to download', error);
    alert('Unable to preview this file. Downloading instead.');
    window.location.href = `/api/files/${file.id}/download`;
  }
}


function updateStorage(progressEl, copyEl) {
  if (!progressEl || !copyEl) return;
  const usedBytes =
    typeof state.storage.usedBytes === 'number'
      ? state.storage.usedBytes
      : Math.round((state.storage.usedMb || 0) * 1024 * 1024);
  const quotaBytes =
    typeof state.storage.quotaBytes === 'number'
      ? state.storage.quotaBytes
      : Math.round((state.storage.quotaMb || 0) * 1024 * 1024);
  const percentUsed = quotaBytes ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;
  
  // Update progress bar visual fill
  progressEl.classList.remove('warning', 'danger');
  if (percentUsed >= 90) {
    progressEl.classList.add('danger');
  } else if (percentUsed >= 70) {
    progressEl.classList.add('warning');
  }
  
  // Ensure the width is set and visible
  progressEl.style.width = `${Math.max(percentUsed, 0)}%`;
  progressEl.style.display = 'block';
  progressEl.style.minWidth = percentUsed > 0 ? '2px' : '0';
  
  copyEl.textContent = `${formatBytesCompact(usedBytes)} of ${formatBytesCompact(quotaBytes)} used`;
}

function detectFileType(file) {
  if (file.isFolder) return 'folder';

  const mime = (file.mimeType || '').toLowerCase();
  const name = (file.originalName || file.name || '').toLowerCase();

  const hasExt = (exts) => exts.some(ext => name.endsWith(ext));

  // PDFs
  if (mime.includes('pdf') || hasExt(['.pdf'])) return 'pdf';

  // Office docs (Word)
  if (
    mime.includes('word') ||
    mime.includes('officedocument.word') ||
    hasExt(['.doc', '.docx'])
  ) {
    return 'document';
  }

  // Spreadsheets (Excel)
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    hasExt(['.xls', '.xlsx'])
  ) {
    return 'spreadsheet';
  }

  // Presentations (PowerPoint)
  if (
    mime.includes('presentation') ||
    hasExt(['.ppt', '.pptx'])
  ) {
    return 'presentation';
  }

  // Zip / rar
  if (
    mime.includes('zip') ||
    mime.includes('x-rar') ||
    hasExt(['.zip', '.rar'])
  ) {
    return 'archive';
  }

  // Videos
  if (
    mime.includes('video') ||
    hasExt(['.mp4', '.mov', '.avi', '.mkv'])
  ) {
    return 'video';
  }

  // Text files
  if (
    mime.includes('text') ||
    hasExt(['.txt', '.md'])
  ) {
    return 'text';
  }

  // Default: treat as generic document
  return 'document';
}


function getIcon(file) {
  const logicalType = detectFileType(file);  // automatic classification
  return TYPE_ICONS[logicalType] || TYPE_ICONS.document;
}




function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatSize(sizeMb = 0) {
  if (sizeMb >= 1024) {
    return `${(sizeMb / 1024).toFixed(1)} GB`;
  }
  return `${sizeMb} MB`;
}

function getLocationQueryValue() {
  const option = LOCATION_OPTIONS.find((opt) => opt.value === state.locationFilter);
  return option?.query || '';
}

function getParentQueryParam() {
  const hasTrail = state.folderTrail.length > 0 || Boolean(state.currentFolderId);
  if (!hasTrail) {
    return state.context === 'mydrive' ? 'root' : '';
  }
  return state.currentFolderId || 'root';
}

function getCurrentFolderId() {
  return state.currentFolderId;
}

function enterFolder(folder) {
  const existingIndex = state.folderTrail.findIndex((crumb) => crumb.id === folder.id);
  if (existingIndex >= 0) {
    state.folderTrail = state.folderTrail.slice(0, existingIndex + 1);
  } else {
    state.folderTrail = [...state.folderTrail, { id: folder.id, name: folder.name }];
  }
  state.currentFolderId = folder.id;
  state.selected.clear();
  state.refreshFn?.();
}

function goToBreadcrumb(index) {
  if (index <= 0) {
    state.folderTrail = [];
    state.currentFolderId = null;
  } else {
    state.folderTrail = state.folderTrail.slice(0, index);
    state.currentFolderId = state.folderTrail[state.folderTrail.length - 1]?.id || null;
  }
  state.selected.clear();
  state.refreshFn?.();
}

function getBreadcrumbRootLabel() {
  switch (state.context) {
    case 'home':
      return 'Home';
    case 'shared':
      return 'Shared with me';
    case 'starred':
      return 'Starred';
    case 'trash':
      return 'Trash';
    case 'mydrive':
    default:
      return 'My Drive';
  }
}

function formatBytesCompact(bytes = 0) {
  if (!bytes) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  }
  const kb = bytes / 1024;
  if (kb >= 1) {
    return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  }
  return `${bytes} B`;
}

function getProfileElements() {
  return {
    greeting: document.getElementById('profile-greeting'),
    email: document.getElementById('profile-email'),
    avatarLetter: document.getElementById('profile-avatar-letter'),
    avatarImage: document.getElementById('profile-avatar-image'),
  };
}

async function loadCurrentUser(elements = {}) {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'same-origin',
    });
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!response.ok) throw new Error('Failed to load user');
    const payload = await response.json();
    state.user = payload.user || null;
    updateProfileCard(elements, state.user);
  } catch (error) {
    console.error('Failed to load user profile', error);
  }
}

function updateProfileCard(elements = {}, user) {
  if (!user) return;
  const trimmedName = (user.name || 'User').trim();
  const firstName = trimmedName.split(' ')[0] || trimmedName || 'User';
  
  // Google Drive style: Show name instead of email
  if (elements.greeting) {
    elements.greeting.textContent = trimmedName || 'User';
  }
  // Hide email element (Google Drive doesn't show email in the profile card)
  if (elements.email) {
    elements.email.textContent = '';
    elements.email.style.display = 'none';
  }
  
  const initial = trimmedName.charAt(0).toUpperCase() || 'U';
  if (user.profileImage && elements.avatarImage) {
    elements.avatarImage.src = user.profileImage;
    elements.avatarImage.hidden = false;
    if (elements.avatarLetter) {
      elements.avatarLetter.hidden = true;
    }
  } else {
    if (elements.avatarLetter) {
      elements.avatarLetter.textContent = initial;
      elements.avatarLetter.hidden = false;
    }
    if (elements.avatarImage) {
      elements.avatarImage.hidden = true;
      elements.avatarImage.removeAttribute('src');
    }
  }
}

function getViewParam() {
  switch (state.context) {
    case 'home':
      return 'home';
    case 'shared':
      return 'shared';
    case 'starred':
      return 'starred';
    case 'trash':
      return 'trash';
    default:
      return 'mydrive';
  }
}

function handleBulkAction(action) {
  const ids = Array.from(state.selected);
  if (!ids.length) return;

  const isTrashPage = state.context === 'trash';

  switch (action) {
    case 'delete':
      if (isTrashPage) {
        const fileNames = ids.map(id => {
          const file = state.data.find(f => f.id === id);
          return file?.name || '';
        });
        window.openDeleteDialog(ids, fileNames);
      } else {
        moveToTrash(ids);
      }
      break;
    case 'move':
      if (isTrashPage) {
        restoreFiles(ids);
      } else {
        openMoveDialog(ids);
      }
      break;
    case 'restore':
      restoreFiles(ids);
      break;
    case 'download':
      ids.forEach((id) => {
        const file = state.data.find((f) => f.id === id);
        if (file?.storagePath) {
          window.open(`/${file.storagePath}`, '_blank');
        }
      });
      break;
    case 'share':
      if (ids.length === 1) {
        openShareDialog(ids[0]);
      } else {
        alert('Please select only one file to share.');
      }
      break;
    case 'rename':
      if (ids.length === 1) {
        openRenameDialog(ids[0]);
      } else {
        alert('Please select only one file to rename.');
      }
      break;
    default:
      if (action === 'details' && ids.length === 1) {
        openDetailsDialog(ids[0]);
      } else if (action === 'make-copy') {
        ids.forEach((id) => makeCopy(id));
      } else {
        alert(`${action} not implemented yet`);
      }
  }
}

async function moveToTrash(ids) {
  try {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/files/${id}/trash`, {
          method: 'POST',
          credentials: 'same-origin',
        })
      )
    );
    state.selected.clear();
    await loadFiles();
    document.getElementById('selection-bar')?.classList.add('hidden');
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    console.error('Failed to move to trash', error);
  }
}

async function restoreFiles(ids) {
  try {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/files/${id}/restore`, {
          method: 'POST',
          credentials: 'same-origin',
        })
      )
    );
    state.selected.clear();
    await loadFiles();
    document.getElementById('selection-bar')?.classList.add('hidden');
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    console.error('Failed to restore files', error);
  }
}

async function deleteForever(ids) {
  try {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/files/${id}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        })
      )
    );
    state.selected.clear();
    await loadFiles();
    document.getElementById('selection-bar')?.classList.add('hidden');
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    console.error('Failed to delete files', error);
  }
}

async function toggleStar(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}/star`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Failed to toggle star');
    await loadFiles();
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    console.error('Failed to toggle star', error);
  }
}

// ---- Offline storage helpers (IndexedDB in window context) ----

const OFFLINE_DB_NAME = 'offline-files-db';
const OFFLINE_STORE_NAME = 'files';

function openOfflineDbWindow() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        const store = db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFileOffline(file, blob) {
  const db = await openOfflineDbWindow();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(OFFLINE_STORE_NAME);
    const record = {
      id: file.id,
      name: file.originalName || file.name,
      mimeType: file.mimeType || 'application/octet-stream',
      blob,
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function removeFileOffline(id) {
  const db = await openOfflineDbWindow();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(OFFLINE_STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}


async function toggleOffline(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}/offline`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('Failed to toggle offline');

    const updatedFile = await response.json();

    // If turned ON: fetch file content and cache it in IndexedDB
    if (updatedFile.availableOffline) {
      if (!updatedFile.storagePath) {
        console.warn('File has no storagePath, cannot cache offline.');
      } else {
        // Use the download endpoint we made earlier
        const downloadResponse = await fetch(`/api/files/${fileId}/download`, {
          credentials: 'same-origin',
        });
        if (!downloadResponse.ok) {
          throw new Error('Failed to download file for offline use');
        }
        const blob = await downloadResponse.blob();
        await saveFileOffline(
          {
            id: updatedFile._id || updatedFile.id || fileId,
            name: updatedFile.name,
            originalName: updatedFile.originalName,
            mimeType: updatedFile.mimeType,
          },
          blob
        );
        console.log('Cached offline copy of', updatedFile.name);
      }
    } else {
      // If turned OFF: remove from IndexedDB
      await removeFileOffline(updatedFile._id || updatedFile.id || fileId);
      console.log('Removed offline copy of', updatedFile.name);
    }

    // Refresh UI
    await loadFiles();
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    console.error('Failed to toggle offline', error);
    alert(error.message || 'Failed to toggle offline');
  }
}


async function makeCopy(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}/copy`, {
      method: 'POST',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || 'Failed to make a copy');
    }

    // Reload the list so the new copy appears
    await loadFiles();
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    alert(error.message || 'Failed to make a copy');
    console.error('makeCopy error', error);
  }
}

// Dynamically flip submenus left/right so they never go off-screen
// Dynamically flip submenus left/right so they never go off-screen
document.addEventListener(
  'mouseover',
  (event) => {
    const submenuItem = event.target.closest('.menu-item.submenu');
    if (!submenuItem) return;

    const submenuMenu = submenuItem.querySelector('.submenu-menu');
    if (!submenuMenu) return;

    // Reset previous inline overrides
    submenuMenu.style.left = '';
    submenuMenu.style.right = '';
    submenuMenu.style.marginLeft = '';
    submenuMenu.style.marginRight = '';

    // Make sure it's using the base "open right" CSS
    // (left: 100%, margin-left: 4px)
    const rect = submenuMenu.getBoundingClientRect();
    const padding = 8; // minimal distance from viewport edges

    // If submenu goes off the right edge -> flip to LEFT
    if (rect.right > window.innerWidth - padding) {
      submenuMenu.style.right = '100%';
      submenuMenu.style.left = 'auto';
      submenuMenu.style.marginRight = '4px';
      submenuMenu.style.marginLeft = '0';
    }
    // If submenu goes off the left edge -> force RIGHT
    else if (rect.left < padding) {
      submenuMenu.style.left = '100%';
      submenuMenu.style.right = 'auto';
      submenuMenu.style.marginLeft = '4px';
      submenuMenu.style.marginRight = '0';
    }
  },
  true // capture phase so we run reliably when hovering
);


