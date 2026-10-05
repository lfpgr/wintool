/**
 * Apps tab — USB catalog, Office setup, Windows image list, lab MAS launcher.
 */

const lazyHelper = new LazyLoadingHelper('apps');
const APPS_JSON = 'WinTool/apps.json';
const KEY_PATTERN = /\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b/gi;

let appsState = {
    drives: [],
    selectedDrive: '',
    catalog: [],
    editingId: null,
    masAcknowledged: false,
};

function getContainer() {
    return (
        document.querySelector('.folder-tab-container[data-tab="apps"]') ||
        document.querySelector('.apps-container') ||
        document
    );
}

function $(id) {
    const container = getContainer();
    return container.querySelector(`#${id}`) || document.getElementById(id);
}

function notify(message, type = 'info') {
    if (window.showNotification) {
        window.showNotification(message, type);
        return;
    }
    if (window.electronAPI?.logInfo && type === 'info') {
        window.electronAPI.logInfo(message, 'AppsTab');
    }
}

function redactKeys(text) {
    if (!text) return '';
    return String(text)
        .replace(KEY_PATTERN, '[REDACTED]')
        .replace(/((?:partial\s+)?product\s+key)\s*[:=]\s*\S+/gi, '$1: [REDACTED]');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function slugId(name) {
    const base = String(name || 'app')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);
    return `${base || 'app'}-${Date.now().toString(36)}`;
}

function appendLog(line) {
    const log = $('apps-lab-log');
    if (!log) return;
    const stamp = new Date().toLocaleTimeString();
    const next = redactKeys(`[${stamp}] ${line}`);
    const current = log.textContent === 'Ready. License checks omit product keys.' ? '' : `${log.textContent}\n`;
    log.textContent = `${current}${next}`.trim();
    log.scrollTop = log.scrollHeight;
}

function api() {
    return window.electronAPI || {};
}

async function refreshDrives() {
    const select = $('apps-drive-select');
    const status = $('apps-drive-status');
    const empty = $('apps-empty-drive');
    const content = $('apps-media-content');

    try {
        const result = await api().usbListMediaDrives();
        const drives = result?.drives || [];
        appsState.drives = drives;

        if (!select) return;

        select.innerHTML = '';
        if (drives.length === 0) {
            select.innerHTML = '<option value="">No WinTool USB detected</option>';
            if (status) status.textContent = 'Insert a removable USB with WinTool\\drive.json (role wintool-media).';
            empty?.classList.remove('hidden');
            content?.classList.add('hidden');
            appsState.selectedDrive = '';
            return;
        }

        const saved = await api().getSetting?.('appsSelectedDrive', '');
        const preferred =
            drives.find(d => d.drive === appsState.selectedDrive)?.drive ||
            drives.find(d => d.drive === saved)?.drive ||
            drives[0].drive;

        drives.forEach(drive => {
            const option = document.createElement('option');
            option.value = drive.drive;
            const label = drive.volumeName ? `${drive.drive} (${drive.volumeName})` : drive.drive;
            option.textContent = drives.length > 1 ? label : label;
            select.appendChild(option);
        });

        select.value = preferred;
        appsState.selectedDrive = preferred;
        await api().setSetting?.('appsSelectedDrive', preferred);

        empty?.classList.add('hidden');
        content?.classList.remove('hidden');

        if (status) {
            status.textContent =
                drives.length > 1
                    ? `${drives.length} media drives found — pick one`
                    : `Using ${preferred}`;
        }

        await loadSelectedDrive();
    } catch (error) {
        notify(`USB scan failed: ${error.message}`, 'error');
        empty?.classList.remove('hidden');
        content?.classList.add('hidden');
    }
}

function currentDriveInfo() {
    return appsState.drives.find(d => d.drive === appsState.selectedDrive) || null;
}

async function loadSelectedDrive() {
    if (!appsState.selectedDrive) return;
    await Promise.all([loadCatalog(), loadOfficeStatus(), loadWindowsImages()]);
}

async function loadCatalog() {
    const grid = $('apps-catalog-grid');
    if (!grid) return;

    const result = await api().usbReadJson(appsState.selectedDrive, APPS_JSON);
    if (!result?.success) {
        appsState.catalog = [];
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-th-large"></i><p>${escapeHtml(result?.error || 'Could not read apps.json')}</p></div>`;
        return;
    }

    appsState.catalog = Array.isArray(result.data) ? result.data : [];
    renderCatalog();
}

function renderCatalog() {
    const grid = $('apps-catalog-grid');
    if (!grid) return;

    if (!appsState.catalog.length) {
        grid.innerHTML =
            '<div class="empty-state"><i class="fas fa-th-large"></i><p>No apps in WinTool\\apps.json yet. Add one to get started.</p></div>';
        return;
    }

    grid.innerHTML = '';
    appsState.catalog.forEach(app => {
        const card = document.createElement('div');
        card.className = 'apps-card';
        card.dataset.id = app.id;

        const iconWrap = document.createElement('div');
        iconWrap.className = 'apps-card-icon';
        if (app.iconDataUrl) {
            const img = document.createElement('img');
            img.alt = '';
            img.src = app.iconDataUrl;
            iconWrap.appendChild(img);
        } else {
            const icon = document.createElement('i');
            icon.className = app.icon && app.icon.startsWith('fa') ? app.icon : 'fas fa-box';
            iconWrap.appendChild(icon);
        }

        const info = document.createElement('div');
        info.className = 'apps-card-info';
        const title = document.createElement('h4');
        title.textContent = app.name || app.id;
        const detail = document.createElement('p');
        detail.textContent = app.source === 'url' ? app.url || '' : app.relativePath || '';
        info.appendChild(title);
        info.appendChild(detail);
        if (app.source === 'url') {
            const badge = document.createElement('span');
            badge.className = 'apps-internet-badge';
            badge.textContent = 'из интернета';
            info.appendChild(badge);
        }

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'apps-card-edit';
        editBtn.title = 'Edit';
        editBtn.innerHTML = '<i class="fas fa-pen"></i>';
        editBtn.addEventListener('click', event => {
            event.stopPropagation();
            openEditModal(app);
        });

        card.appendChild(iconWrap);
        card.appendChild(info);
        card.appendChild(editBtn);
        card.addEventListener('click', () => launchCatalogApp(app));
        grid.appendChild(card);
    });
}

async function launchCatalogApp(app) {
    if (!appsState.selectedDrive || !app) return;
    try {
        const result = await api().usbOpenItem({
            drive: appsState.selectedDrive,
            source: app.source,
            url: app.url,
            relativePath: app.relativePath,
        });
        if (!result?.success) {
            notify(result?.error || 'Could not open app', 'error');
            return;
        }
        notify(`Opened ${app.name}`, 'success');
    } catch (error) {
        notify(error.message, 'error');
    }
}

async function loadOfficeStatus() {
    const info = currentDriveInfo();
    const button = $('apps-office-setup');
    const status = $('apps-office-status');
    const available = Boolean(info?.hasOfficeSetup);
    if (button) button.disabled = !available;
    if (status) {
        status.textContent = available
            ? `${info.drive}\\Office\\setup.exe found`
            : 'Office\\setup.exe not found on this drive';
    }
}

async function loadWindowsImages() {
    const body = $('apps-windows-table-body');
    if (!body || !appsState.selectedDrive) return;

    const result = await api().usbListWindowsImages(appsState.selectedDrive);
    body.innerHTML = '';
    const files = result?.files || [];
    if (!files.length) {
        body.innerHTML = '<tr><td colspan="3">No files in Windows\\</td></tr>';
        return;
    }

    files.forEach(file => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${escapeHtml(file.name)}</td><td>${escapeHtml(file.ext || '')}</td><td>${escapeHtml(file.sizeLabel || '')}</td>`;
        body.appendChild(row);
    });
}

function setMasButtonsEnabled(enabled) {
    const winBtn = $('apps-mas-windows');
    const officeBtn = $('apps-mas-office');
    if (winBtn) winBtn.disabled = !enabled;
    if (officeBtn) officeBtn.disabled = !enabled;
}

async function loadMasAck() {
    const checkbox = $('apps-mas-ack');
    const saved = await api().getSetting?.('labMasAcknowledged', false);
    appsState.masAcknowledged = Boolean(saved);
    if (checkbox) checkbox.checked = appsState.masAcknowledged;
    setMasButtonsEnabled(appsState.masAcknowledged);
}

function toggleSourceFields() {
    const source = $('apps-edit-source')?.value;
    const urlRow = $('apps-edit-url-row');
    const pathRow = $('apps-edit-path-row');
    if (urlRow) urlRow.style.display = source === 'url' ? '' : 'none';
    if (pathRow) pathRow.style.display = source === 'usb' ? '' : 'none';
}

function renderIconPreview(iconValue, dataUrl) {
    const preview = $('apps-icon-preview');
    if (!preview) return;
    preview.innerHTML = '';
    if (dataUrl) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = dataUrl;
        preview.appendChild(img);
        return;
    }
    const icon = document.createElement('i');
    icon.className = iconValue && iconValue.startsWith('fa') ? iconValue : 'fas fa-box';
    preview.appendChild(icon);
}

function openEditModal(app) {
    appsState.editingId = app?.id || null;
    const modal = $('apps-edit-modal');
    const title = $('apps-edit-title');
    const deleteBtn = $('apps-edit-delete');
    if (title) title.textContent = app ? 'Edit application' : 'Add application';
    if (deleteBtn) deleteBtn.style.display = app ? '' : 'none';

    $('apps-edit-id').value = app?.id || '';
    $('apps-edit-name').value = app?.name || '';
    $('apps-edit-source').value = app?.source === 'url' ? 'url' : 'usb';
    $('apps-edit-url').value = app?.url || '';
    $('apps-edit-relative-path').value = app?.relativePath || '';
    $('apps-edit-icon').value = app?.icon || 'fas fa-box';
    $('apps-edit-icon').dataset.dataUrl = app?.iconDataUrl || '';
    toggleSourceFields();
    renderIconPreview(app?.icon, app?.iconDataUrl);
    modal?.classList.add('show');
}

function closeEditModal() {
    $('apps-edit-modal')?.classList.remove('show');
    appsState.editingId = null;
}

function collectAppFromForm() {
    const source = $('apps-edit-source').value;
    const name = $('apps-edit-name').value.trim();
    const icon = $('apps-edit-icon').value.trim() || 'fas fa-box';
    const existingId = $('apps-edit-id').value.trim();
    if (!name) {
        throw new Error('Name is required');
    }

    const app = {
        id: existingId || slugId(name),
        name,
        icon,
        source,
    };

    if (source === 'url') {
        const url = $('apps-edit-url').value.trim();
        if (!/^https?:\/\//i.test(url)) {
            throw new Error('URL must start with http:// or https://');
        }
        app.url = url;
    } else {
        const relativePath = $('apps-edit-relative-path').value.trim().replace(/\\/g, '/');
        if (!relativePath || relativePath.includes('..')) {
            throw new Error('Relative USB path is required and cannot contain ..');
        }
        app.relativePath = relativePath;
    }

    return app;
}

async function saveCatalog(nextCatalog) {
    const result = await api().usbWriteJson(appsState.selectedDrive, APPS_JSON, nextCatalog);
    if (!result?.success) {
        throw new Error(result?.error || 'Failed to write apps.json');
    }
    await loadCatalog();
}

function setupEventListeners() {
    $('apps-refresh-drives')?.addEventListener('click', () => refreshDrives());
    $('apps-drive-select')?.addEventListener('change', async event => {
        appsState.selectedDrive = event.target.value;
        await api().setSetting?.('appsSelectedDrive', appsState.selectedDrive);
        if (appsState.selectedDrive) {
            $('apps-empty-drive')?.classList.add('hidden');
            $('apps-media-content')?.classList.remove('hidden');
            await loadSelectedDrive();
        }
    });

    $('apps-add-app')?.addEventListener('click', () => openEditModal(null));
    $('apps-edit-close')?.addEventListener('click', closeEditModal);
    $('apps-edit-source')?.addEventListener('change', toggleSourceFields);
    $('apps-edit-icon')?.addEventListener('input', event => {
        renderIconPreview(event.target.value, event.target.dataset.dataUrl);
    });

    $('apps-edit-icon-file')?.addEventListener('click', async () => {
        if (!appsState.selectedDrive) return;
        const dialog = await api().showOpenDialog?.({
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'bmp', 'svg'] }],
        });
        if (!dialog || dialog.canceled || !dialog.filePaths?.[0]) return;
        const copied = await api().usbCopyIcon(appsState.selectedDrive, dialog.filePaths[0]);
        if (!copied?.success) {
            notify(copied?.error || 'Could not copy icon', 'error');
            return;
        }
        $('apps-edit-icon').value = copied.relativePath;
        $('apps-edit-icon').dataset.dataUrl = copied.dataUrl || '';
        renderIconPreview(copied.relativePath, copied.dataUrl);
    });

    $('apps-edit-save')?.addEventListener('click', async () => {
        try {
            const app = collectAppFromForm();
            const next = appsState.catalog.filter(item => item.id !== app.id);
            next.push(app);
            await saveCatalog(next);
            closeEditModal();
            notify('Catalog saved', 'success');
        } catch (error) {
            notify(error.message, 'error');
        }
    });

    $('apps-edit-delete')?.addEventListener('click', async () => {
        const id = $('apps-edit-id').value;
        if (!id) return;
        const next = appsState.catalog.filter(item => item.id !== id);
        try {
            await saveCatalog(next);
            closeEditModal();
            notify('App removed', 'success');
        } catch (error) {
            notify(error.message, 'error');
        }
    });

    $('apps-office-setup')?.addEventListener('click', async () => {
        const result = await api().usbStartOfficeSetup(appsState.selectedDrive);
        if (!result?.success) {
            notify(result?.error || 'Could not start Office setup', 'error');
            return;
        }
        notify('Office setup started', 'success');
    });

    $('apps-mas-ack')?.addEventListener('change', async event => {
        appsState.masAcknowledged = Boolean(event.target.checked);
        await api().setSetting?.('labMasAcknowledged', appsState.masAcknowledged);
        setMasButtonsEnabled(appsState.masAcknowledged);
    });

    $('apps-mas-windows')?.addEventListener('click', () => runMas('windows'));
    $('apps-mas-office')?.addEventListener('click', () => runMas('office'));
    $('apps-license-check')?.addEventListener('click', checkLicenses);

    $('apps-edit-modal')?.addEventListener('click', event => {
        if (event.target.id === 'apps-edit-modal') closeEditModal();
    });
}

async function runMas(action) {
    if (!appsState.masAcknowledged) {
        notify('Acknowledge the lab disclaimer first', 'warning');
        return;
    }
    appendLog(`Launching USB lab script (${action})`);
    const result = await api().usbRunMas(appsState.selectedDrive, action);
    if (!result?.success) {
        appendLog(result?.error || 'Launch failed');
        notify(result?.error || 'Could not start lab script', 'error');
        return;
    }
    appendLog('Lab script started from USB');
}

async function checkLicenses() {
    appendLog('Checking license status…');
    const result = await api().getLicenseStatus();
    if (!result?.success) {
        appendLog(result?.error || 'License check failed');
        return;
    }
    if (result.windows) appendLog(`Windows:\n${redactKeys(result.windows)}`);
    if (result.office) appendLog(`Office:\n${redactKeys(result.office)}`);
    if (!result.windows && !result.office) appendLog('No license status returned');
}

async function initAppsTab() {
    if (!lazyHelper.shouldInitialize()) {
        lazyHelper.markTabReady();
        return;
    }
    lazyHelper.markScriptExecuted();

    try {
        setupEventListeners();
        await loadMasAck();
        await refreshDrives();
        lazyHelper.markTabReady();
    } catch (error) {
        if (window.electronAPI?.logError) {
            window.electronAPI.logError(`Apps tab init failed: ${error.message}`, 'AppsTab');
        }
        lazyHelper.markTabReady();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppsTab);
} else {
    initAppsTab();
}

lazyHelper.createGlobalResetFunction();
