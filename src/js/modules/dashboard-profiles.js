/**
 * Dashboard named widget profiles
 *
 * Loads and saves profiles through electronAPI getSetting/setSetting.
 * Renders the active profile's widgets and provides customize mode.
 */
(function (global) {
    'use strict';

    const SETTINGS_PROFILES_KEY = 'dashboardProfiles';
    const SETTINGS_ACTIVE_KEY = 'activeDashboardProfile';

    const DEFAULT_PROFILES = [
        {
            id: 'lab',
            name: 'Lab',
            widgets: ['usb-status', 'apps', 'services', 'system-info', 'cleanup'],
        },
    ];
    const DEFAULT_ACTIVE_ID = 'lab';

    let profiles = clone(DEFAULT_PROFILES);
    let activeId = DEFAULT_ACTIVE_ID;
    let customizing = false;
    let bound = false;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function notify(message, type) {
        if (typeof global.showNotification === 'function') {
            global.showNotification(message, type);
        }
    }

    function escapeHtml(value) {
        if (global.WidgetRegistry && typeof global.WidgetRegistry.escapeHtml === 'function') {
            return global.WidgetRegistry.escapeHtml(value);
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getActiveProfile() {
        return profiles.find(profile => profile.id === activeId) || profiles[0] || null;
    }

    function slugify(name) {
        const slug = String(name)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'profile';
    }

    function uniqueProfileId(name) {
        const ids = new Set(profiles.map(profile => profile.id));
        const base = slugify(name);
        let id = base;
        let index = 2;
        while (ids.has(id)) {
            id = `${base}-${index}`;
            index += 1;
        }
        return id;
    }

    async function persist() {
        if (!global.electronAPI) {
            return;
        }
        if (typeof global.electronAPI.setSetting === 'function') {
            await global.electronAPI.setSetting(SETTINGS_PROFILES_KEY, profiles);
            await global.electronAPI.setSetting(SETTINGS_ACTIVE_KEY, activeId);
        }
    }

    function sanitizeProfiles(rawProfiles) {
        if (!Array.isArray(rawProfiles) || rawProfiles.length === 0) {
            return clone(DEFAULT_PROFILES);
        }

        const registry = global.WidgetRegistry;
        const knownIds = new Set(registry ? registry.getAll().map(widget => widget.id) : []);

        const cleaned = rawProfiles
            .filter(profile => profile && profile.id)
            .map(profile => ({
                id: String(profile.id),
                name: profile.name ? String(profile.name) : String(profile.id),
                widgets: Array.isArray(profile.widgets)
                    ? profile.widgets.filter(id => !knownIds.size || knownIds.has(id))
                    : [],
            }));

        return cleaned.length ? cleaned : clone(DEFAULT_PROFILES);
    }

    async function loadState() {
        profiles = clone(DEFAULT_PROFILES);
        activeId = DEFAULT_ACTIVE_ID;

        if (!global.electronAPI || typeof global.electronAPI.getSetting !== 'function') {
            return;
        }

        const storedProfiles = await global.electronAPI.getSetting(
            SETTINGS_PROFILES_KEY,
            DEFAULT_PROFILES
        );
        const storedActive = await global.electronAPI.getSetting(
            SETTINGS_ACTIVE_KEY,
            DEFAULT_ACTIVE_ID
        );

        profiles = sanitizeProfiles(storedProfiles);
        activeId =
            typeof storedActive === 'string' && profiles.some(profile => profile.id === storedActive)
                ? storedActive
                : profiles[0].id;
    }

    function renderProfileSelect() {
        const select = document.getElementById('dashboard-profile-select');
        if (!select) {
            return;
        }

        select.innerHTML = profiles
            .map(
                profile =>
                    `<option value="${escapeHtml(profile.id)}"${
                        profile.id === activeId ? ' selected' : ''
                    }>${escapeHtml(profile.name)}</option>`
            )
            .join('');
    }

    function renderWidgetGrid() {
        const grid = document.getElementById('dashboard-widget-grid');
        const registry = global.WidgetRegistry;
        if (!grid || !registry) {
            return;
        }

        const profile = getActiveProfile();
        const widgetIds = profile ? profile.widgets : [];
        grid.innerHTML = '';

        if (!widgetIds.length) {
            const empty = document.createElement('div');
            empty.className = 'dashboard-empty-state';
            empty.textContent = 'No widgets in this profile. Click Customize to add some.';
            grid.appendChild(empty);
            return;
        }

        widgetIds.forEach(widgetId => {
            const widget = registry.get(widgetId);
            if (!widget) {
                return;
            }

            const cell = document.createElement('div');
            cell.className = 'dashboard-widget';
            cell.dataset.widgetId = widgetId;
            grid.appendChild(cell);

            if (typeof widget.render === 'function') {
                widget.render(cell);
            }
        });
    }

    function renderCustomizePanel() {
        const panel = document.getElementById('dashboard-customize-panel');
        const catalog = document.getElementById('dashboard-widget-catalog');
        const orderList = document.getElementById('dashboard-widget-order');
        const nameInput = document.getElementById('dashboard-profile-name-input');
        const customizeBtn = document.getElementById('dashboard-customize-btn');
        const registry = global.WidgetRegistry;
        const profile = getActiveProfile();

        if (!panel || !catalog || !orderList || !registry || !profile) {
            return;
        }

        panel.hidden = !customizing;
        if (customizeBtn) {
            const label = customizing
                ? (global.t ? global.t('Done') : 'Done')
                : (global.t ? global.t('Customize') : 'Customize');
            const icon = customizing ? 'fa-check' : 'fa-sliders-h';
            customizeBtn.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
        }

        if (nameInput && document.activeElement !== nameInput) {
            nameInput.value = profile.name;
        }

        const enabled = new Set(profile.widgets);
        catalog.innerHTML = '';

        registry.getGroups().forEach((groupWidgets, groupName) => {
            if (!groupWidgets.length) {
                return;
            }

            const section = document.createElement('div');
            section.className = 'dashboard-widget-group';
            section.innerHTML = `<h4>${escapeHtml(groupName)}</h4>`;

            groupWidgets.forEach(widget => {
                const label = document.createElement('label');
                label.className = 'settings-label dashboard-widget-option';
                label.innerHTML = `
                    <input type="checkbox" class="settings-checkbox" data-widget-id="${escapeHtml(
                        widget.id
                    )}" ${enabled.has(widget.id) ? 'checked' : ''}>
                    ${escapeHtml(widget.name)}
                `;
                section.appendChild(label);
            });

            catalog.appendChild(section);
        });

        orderList.innerHTML = '';
        if (!profile.widgets.length) {
            const empty = document.createElement('li');
            empty.className = 'dashboard-order-empty';
            empty.textContent = 'Select widgets to show them here.';
            orderList.appendChild(empty);
            return;
        }

        profile.widgets.forEach((widgetId, index) => {
            const widget = registry.get(widgetId);
            const item = document.createElement('li');
            item.className = 'dashboard-order-item';
            item.innerHTML = `
                <span>${escapeHtml(widget ? widget.name : widgetId)}</span>
                <span class="dashboard-order-buttons">
                    <button type="button" class="btn btn-small btn-secondary" data-move="up"
                        data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Move up">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button type="button" class="btn btn-small btn-secondary" data-move="down"
                        data-index="${index}" ${index === profile.widgets.length - 1 ? 'disabled' : ''}
                        aria-label="Move down">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                </span>
            `;
            orderList.appendChild(item);
        });
    }

    function renderAll() {
        renderProfileSelect();
        renderWidgetGrid();
        renderCustomizePanel();
    }

    async function setActiveProfile(profileId) {
        if (!profiles.some(profile => profile.id === profileId)) {
            return;
        }
        activeId = profileId;
        await persist();
        renderAll();
    }

    async function toggleWidget(widgetId, enabled) {
        const profile = getActiveProfile();
        if (!profile) {
            return;
        }

        if (enabled && !profile.widgets.includes(widgetId)) {
            profile.widgets.push(widgetId);
        } else if (!enabled) {
            profile.widgets = profile.widgets.filter(id => id !== widgetId);
        }

        await persist();
        renderWidgetGrid();
        renderCustomizePanel();
    }

    async function moveWidget(index, direction) {
        const profile = getActiveProfile();
        if (!profile) {
            return;
        }

        const target = index + direction;
        if (target < 0 || target >= profile.widgets.length) {
            return;
        }

        const widgets = profile.widgets;
        const current = widgets[index];
        widgets[index] = widgets[target];
        widgets[target] = current;

        await persist();
        renderWidgetGrid();
        renderCustomizePanel();
    }

    function readNameInput() {
        const input = document.getElementById('dashboard-profile-name-input');
        return input ? input.value.trim() : '';
    }

    async function createProfile() {
        const name = readNameInput() || `Profile ${profiles.length + 1}`;
        const profile = {
            id: uniqueProfileId(name),
            name,
            widgets: [],
        };
        profiles.push(profile);
        activeId = profile.id;
        customizing = true;
        await persist();
        renderAll();
        notify(`Created profile "${name}"`, 'success');
    }

    async function renameProfile() {
        const profile = getActiveProfile();
        if (!profile) {
            return;
        }

        const name = readNameInput();
        if (!name) {
            notify('Enter a profile name to rename', 'warning');
            return;
        }

        profile.name = name;
        await persist();
        renderAll();
        notify(`Renamed profile to "${name}"`, 'success');
    }

    async function deleteProfile() {
        if (profiles.length <= 1) {
            notify('Keep at least one dashboard profile', 'warning');
            return;
        }

        const profile = getActiveProfile();
        if (!profile) {
            return;
        }

        const confirmed = global.confirm
            ? global.confirm(`Delete profile "${profile.name}"?`)
            : true;
        if (!confirmed) {
            return;
        }

        profiles = profiles.filter(item => item.id !== profile.id);
        activeId = profiles[0].id;
        await persist();
        renderAll();
        notify(`Deleted profile "${profile.name}"`, 'info');
    }

    function bindEvents() {
        if (bound) {
            return;
        }
        bound = true;

        const select = document.getElementById('dashboard-profile-select');
        const customizeBtn = document.getElementById('dashboard-customize-btn');
        const createBtn = document.getElementById('dashboard-create-profile-btn');
        const renameBtn = document.getElementById('dashboard-rename-profile-btn');
        const deleteBtn = document.getElementById('dashboard-delete-profile-btn');
        const catalog = document.getElementById('dashboard-widget-catalog');
        const orderList = document.getElementById('dashboard-widget-order');

        if (select) {
            select.addEventListener('change', event => {
                setActiveProfile(event.target.value);
            });
        }

        if (customizeBtn) {
            customizeBtn.addEventListener('click', () => {
                customizing = !customizing;
                renderCustomizePanel();
            });
        }

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                createProfile();
            });
        }

        if (renameBtn) {
            renameBtn.addEventListener('click', () => {
                renameProfile();
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                deleteProfile();
            });
        }

        if (catalog) {
            catalog.addEventListener('change', event => {
                const checkbox = event.target.closest('input[data-widget-id]');
                if (!checkbox) {
                    return;
                }
                toggleWidget(checkbox.getAttribute('data-widget-id'), checkbox.checked);
            });
        }

        if (orderList) {
            orderList.addEventListener('click', event => {
                const button = event.target.closest('button[data-move]');
                if (!button || button.disabled) {
                    return;
                }
                const index = Number(button.getAttribute('data-index'));
                const direction = button.getAttribute('data-move') === 'up' ? -1 : 1;
                moveWidget(index, direction);
            });
        }
    }

    async function initDashboard() {
        if (!document.getElementById('tab-welcome')) {
            return;
        }

        bindEvents();
        await loadState();
        renderAll();
    }

    global.DashboardProfiles = {
        init: initDashboard,
        getProfiles() {
            return clone(profiles);
        },
        getActiveProfileId() {
            return activeId;
        },
        DEFAULT_PROFILES,
        DEFAULT_ACTIVE_ID,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
        initDashboard();
    }
})(window);
