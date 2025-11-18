const TYPE_ICONS = {
  folder: '📁',
  document: '📝',
  spreadsheet: '📊',
  presentation: '📊',
  pdf: '📕',
  video: '🎬',
  archive: '🗜️',
  text: '📄',
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

    if (toggleBtn && insideKebab) {
      document.querySelectorAll('.kebab.open').forEach((k) => {
        if (k !== insideKebab) k.classList.remove('open');
      });
      insideKebab.classList.toggle('open');
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
    if (!typeSelectInForm || !newFileUploadRow) return;
    const hideUpload = typeSelectInForm.value === 'folder';
    newFileUploadRow.style.display = hideUpload ? 'none' : 'flex';
    if (hideUpload && newFileUpload) {
      newFileUpload.value = '';
      resetSizeInput();
    }
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
    const file = newFileUpload.files?.[0];
    if (file) {
      sizeInput.value = (file.size / (1024 * 1024)).toFixed(2);
      sizeInput.readOnly = true;
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

    if (payload.isFolder) {
      payload.type = 'folder';
      payload.sizeMb = 0;
    }

    try {
      const selectedFile = newFileUpload?.files?.[0];
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
  let currentMoveFileId = null;

  moveCancel?.addEventListener('click', () => {
    moveDialog?.close();
    if (moveError) moveError.textContent = '';
  });

  moveSave?.addEventListener('click', async () => {
    if (!currentMoveFileId || !moveFolderSelect) return;
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
      const response = await fetch('/api/files/folders');
      if (!response.ok) throw new Error('Failed to load folders');
      return await response.json();
    } catch (error) {
      console.error('Failed to load folders', error);
      return [];
    }
  }

  window.openMoveDialog = async (fileId) => {
    const file = state.data.find((f) => f.id === fileId);
    if (!file || !moveDialog) return;
    currentMoveFileId = fileId;
    if (moveFileName) moveFileName.textContent = file.name;
    if (moveError) moveError.textContent = '';

    // Load folders and populate select
    const folders = await loadFolders();
    if (moveFolderSelect) {
      moveFolderSelect.innerHTML = '<option value="">My Drive (root)</option>';
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

  const response = await fetch(`/api/files?${params.toString()}`);
  if (!response.ok) {
    if (response.status === 400 && (state.currentFolderId || state.folderTrail.length)) {
      state.currentFolderId = null;
      state.folderTrail = [];
      return loadFiles();
    }
    throw new Error('Failed to fetch files');
  }
  const payload = await response.json();
  state.data = (payload.data || []).map(normalizeFile);
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
  };
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

  row.innerHTML = `
    <div class="file-checkbox">
      <input type="checkbox" class="file-select" ${selected ? 'checked' : ''} aria-label="Select ${file.name}">
    </div>
    <div class="file-main">
      <span class="file-icon">${getIcon(file)}</span>
      <div>
        <div class="file-name">${file.name}</div>
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

  card.innerHTML = `
    <div class="file-main">
      <span class="file-icon">${getIcon(file)}</span>
      <div>
        <div class="file-name">${file.name}</div>
        <div class="file-meta">${file.owner} • ${formatDate(file.uploadedAt)}</div>
      </div>
    </div>
    <div class="grid-meta">
      <span>Location: ${file.location}</span>
      <span>Size: ${formatSize(file.sizeMb)}</span>
      <span>Shared: ${file.sharedWith.length || 'Private'}</span>
    </div>
    <div class="file-actions-inline">
      ${renderInlineActions(file)}
    </div>
  `;

  return card;
}

function renderInlineActions(file) {
  const starIcon = file.starred ? '⭐' : '☆';
  const starTitle = file.starred ? 'Unstar' : 'Star';
  const isTrashPage = state.context === 'trash';
  
  const kebabMenuItems = isTrashPage
    ? `
        <div class="menu-item" data-action="details">View details</div>
        <div class="menu-item" data-action="restore">Restore</div>
        <div class="menu-item" data-action="delete">Delete forever</div>
      `
    : `
        <div class="menu-item" data-action="details">View details</div>
        <div class="menu-item" data-action="move">Move to…</div>
        <div class="menu-item" data-action="offline">Make available offline</div>
        <div class="menu-item" data-action="trash">Move to trash</div>
      `;
  
  return `
    <button class="icon-btn" data-action="share" title="Share">⤴</button>
    <button class="icon-btn" data-action="download" title="Download">⬇</button>
    <button class="icon-btn" data-action="rename" title="Rename">✏️</button>
    <button class="icon-btn" data-action="star" title="${starTitle}">${starIcon}</button>
    <div class="kebab">
      <button class="icon-btn kebab-toggle" aria-label="More options">⋮</button>
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
}

function updateViewButtons(btns) {
  btns.forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.view === state.viewMode ? 'true' : 'false');
  });
}

function handleFileAction(action, fileId) {
  const file = state.data.find((item) => item.id === fileId);
  if (!file) return;
  console.log(`Action ${action} on ${file.name}`);

  if (action === 'download' && file.storagePath) {
    window.open(`/${file.storagePath}`, '_blank');
    return;
  }

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
      if (confirm(`Permanently delete "${file.name}"? This cannot be undone.`)) {
        deleteForever([fileId]);
      }
    } else {
      deleteForever([fileId]);
    }
    return;
  }

  if (action === 'star') {
    toggleStar(fileId);
    return;
  }

  if (action === 'share') {
    openShareDialog(fileId);
    return;
  }

  if (action === 'rename') {
    openRenameDialog(fileId);
    return;
  }

  if (action === 'move') {
    openMoveDialog(fileId);
    return;
  }

  if (action === 'offline') {
    toggleOffline(fileId);
    return;
  }

  if (action === 'details') {
    openDetailsDialog(fileId);
  }
}

function openFile(fileId) {
  const file = state.data.find((item) => item.id === fileId);
  if (!file) return;
  if (file.isFolder) {
    enterFolder(file);
  } else {
    if (file.storagePath) {
      window.open(`/${file.storagePath}`, '_blank');
    } else {
      alert(`Previewing "${file.name}" (placeholder)`);
    }
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
  progressEl.classList.remove('warning', 'danger');
  if (percentUsed >= 90) {
    progressEl.classList.add('danger');
  } else if (percentUsed >= 70) {
    progressEl.classList.add('warning');
  }
  progressEl.style.width = `${percentUsed}%`;
  copyEl.textContent = `${formatBytesCompact(usedBytes)} of ${formatBytesCompact(quotaBytes)} used`;
}

function getIcon(file) {
  if (file.isFolder) return TYPE_ICONS.folder;
  return TYPE_ICONS[file.type] || '📄';
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
    const response = await fetch('/api/auth/me');
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
  if (elements.greeting) {
    elements.greeting.textContent = `Hi, ${firstName}!`;
  }
  if (elements.email) {
    elements.email.textContent = user.email || '';
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
        if (confirm(`Permanently delete ${ids.length} item(s)? This cannot be undone.`)) {
          deleteForever(ids);
        }
      } else {
        moveToTrash(ids);
      }
      break;
    case 'move':
      if (isTrashPage) {
        restoreFiles(ids);
      } else {
        if (ids.length === 1) {
          openMoveDialog(ids[0]);
        } else {
          alert('Please select only one file to move.');
        }
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
      alert(`${action} not implemented yet`);
  }
}

async function moveToTrash(ids) {
  try {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/files/${id}/trash`, {
          method: 'POST',
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
    });
    if (!response.ok) throw new Error('Failed to toggle star');
    await loadFiles();
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    console.error('Failed to toggle star', error);
  }
}

async function toggleOffline(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}/offline`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to toggle offline');
    await loadFiles();
    renderFiles(state.data, document.getElementById('file-list'));
  } catch (error) {
    console.error('Failed to toggle offline', error);
  }
}
