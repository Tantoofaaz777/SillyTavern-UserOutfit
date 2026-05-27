import {
    event_types,
    eventSource,
    isGenerating,
    name1,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { persona_description_positions, power_user } from '../../../power-user.js';
import { user_avatar } from '../../../personas.js';

const DEFAULT_PERSONA_KEY = '__default__';
const OUTFIT_FIELDS = [
    { key: 'top', label: 'Top' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'footwear', label: 'Footwear' },
    { key: 'accessories', label: 'Accessories' },
];

const defaultSettings = {
    outfits: {},
    triggerPos: null,
};

let patchState = {
    active: false,
    snapshot: null,
    patchedDescription: '',
    personaKey: '',
    abortWatcher: null,
};

let dragState = {
    dragging: false,
    movedEnough: false,
    suppressNextClick: false,
    startX: 0,
    startY: 0,
    baseLeft: 0,
    baseTop: 0,
};

function getSettings() {
    if (!extension_settings.userOutfit) {
        extension_settings.userOutfit = structuredClone(defaultSettings);
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings.userOutfit[key] === undefined) {
            extension_settings.userOutfit[key] = structuredClone(value);
        }
    }

    if (!extension_settings.userOutfit.outfits || typeof extension_settings.userOutfit.outfits !== 'object') {
        extension_settings.userOutfit.outfits = {};
    }

    return extension_settings.userOutfit;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isCompactViewport() {
    return window.matchMedia('(max-width: 1000px), (pointer: coarse)').matches;
}

function getPersonaKey() {
    return user_avatar || DEFAULT_PERSONA_KEY;
}

function getPersonaName() {
    return power_user.personas?.[user_avatar] || name1 || 'The user';
}

function normalizeOutfit(value) {
    if (typeof value === 'string') {
        return {
            top: value,
            bottom: '',
            footwear: '',
            accessories: '',
        };
    }

    if (value && typeof value === 'object') {
        for (const field of OUTFIT_FIELDS) {
            value[field.key] = String(value[field.key] || '');
        }

        return value;
    }

    return Object.fromEntries(OUTFIT_FIELDS.map(field => [field.key, '']));
}

function getOutfit() {
    const settings = getSettings();
    const key = getPersonaKey();
    const rawOutfit = settings.outfits[key];
    const outfit = normalizeOutfit(rawOutfit);

    if (rawOutfit !== undefined && rawOutfit !== outfit) {
        settings.outfits[key] = outfit;
        saveSettingsDebounced();
    }

    return outfit;
}

function hasOutfit(outfit = getOutfit()) {
    return OUTFIT_FIELDS.some(field => String(outfit[field.key] || '').trim().length > 0);
}

function setOutfitField(fieldKey, value) {
    const settings = getSettings();
    const key = getPersonaKey();
    const outfit = getOutfit();
    outfit[fieldKey] = String(value || '');

    if (hasOutfit(outfit)) {
        settings.outfits[key] = outfit;
    } else {
        delete settings.outfits[key];
    }

    saveSettingsDebounced();
    updateButtonState();
}

function clearOutfit() {
    const settings = getSettings();
    delete settings.outfits[getPersonaKey()];
    saveSettingsDebounced();
    syncPanel();
}

function formatOutfitBlock(outfit = getOutfit()) {
    const lines = OUTFIT_FIELDS
        .map(field => ({ label: field.label, value: String(outfit[field.key] || '').trim() }))
        .filter(field => field.value.length > 0)
        .map(field => `${field.label}: ${field.value}`);

    return lines.length ? ['Current outfit:', ...lines].join('\n') : '';
}

function snapshotPersona() {
    return {
        persona_description: String(power_user.persona_description || ''),
    };
}

function restorePersonaDescriptionIfUnchanged() {
    if (!patchState.snapshot) {
        return;
    }

    if (getPersonaKey() !== patchState.personaKey || power_user.persona_description !== patchState.patchedDescription) {
        console.debug('User Outfit: Skipped persona outfit restore because persona state changed during generation');
        return;
    }

    power_user.persona_description = patchState.snapshot.persona_description;
}

function stopAbortWatcher() {
    if (patchState.abortWatcher) {
        window.clearInterval(patchState.abortWatcher);
        patchState.abortWatcher = null;
    }
}

function startAbortWatcher() {
    stopAbortWatcher();

    patchState.abortWatcher = window.setInterval(() => {
        if (!patchState.active) {
            stopAbortWatcher();
            return;
        }

        if (!isGenerating()) {
            restorePersonaPatch('generation unblocked');
        }
    }, 500);
}

function applyPersonaPatch(reason) {
    if (patchState.active) {
        return;
    }

    if (power_user.persona_description_position === persona_description_positions.NONE) {
        console.debug(`User Outfit: Skipped persona outfit patch because persona injection is disabled (${reason})`);
        return;
    }

    const outfitBlock = formatOutfitBlock();
    if (!outfitBlock) {
        return;
    }

    const snapshot = snapshotPersona();
    const baseDescription = snapshot.persona_description;
    const finalDescription = baseDescription.trim().length > 0
        ? `${baseDescription}\n\n${outfitBlock}`
        : outfitBlock;

    if (finalDescription === baseDescription) {
        return;
    }

    patchState.active = true;
    patchState.snapshot = snapshot;
    patchState.patchedDescription = finalDescription;
    patchState.personaKey = getPersonaKey();
    power_user.persona_description = finalDescription;
    startAbortWatcher();

    console.debug(`User Outfit: Applied persona outfit patch (${reason})`);
}

function restorePersonaPatch(reason) {
    if (!patchState.active) {
        return;
    }

    try {
        restorePersonaDescriptionIfUnchanged();
    } finally {
        stopAbortWatcher();
        patchState.active = false;
        patchState.snapshot = null;
        patchState.patchedDescription = '';
        patchState.personaKey = '';
    }

    console.debug(`User Outfit: Restored persona outfit patch (${reason})`);
}

function updateButtonState() {
    const outfitHasValue = hasOutfit();
    $('#user_outfit_button')
        .toggleClass('user_outfit_has_value', outfitHasValue)
        .attr('title', outfitHasValue ? 'Edit user outfit' : 'Add user outfit');
}

function syncPanel() {
    const outfit = getOutfit();
    for (const field of OUTFIT_FIELDS) {
        $(`#user_outfit_${field.key}`).val(outfit[field.key] || '');
    }
    $('#user_outfit_title').text(`${getPersonaName()}'s Outfit`);
    updateButtonState();
}

function placePanelNearButton() {
    const panel = document.getElementById('user_outfit_panel');
    const button = document.getElementById('user_outfit_button');

    if (!panel || !button || !panel.classList.contains('user_outfit_open')) {
        return;
    }

    const wasHidden = getComputedStyle(panel).display === 'none';
    if (wasHidden) {
        panel.style.visibility = 'hidden';
        panel.style.display = 'flex';
    }

    const gap = isCompactViewport() ? 12 : 8;
    const buttonRect = button.getBoundingClientRect();
    panel.classList.toggle('user_outfit_compact', isCompactViewport());

    if (isCompactViewport()) {
        panel.style.width = `${Math.min(340, window.innerWidth - 16)}px`;
        panel.style.maxHeight = `${Math.max(180, Math.min(window.innerHeight * 0.58, window.innerHeight - 96))}px`;
    } else {
        panel.style.width = '';
        panel.style.maxHeight = '';
    }

    const panelWidth = panel.offsetWidth || 320;
    const panelHeight = panel.offsetHeight || 220;
    let left = buttonRect.right + gap;
    let top = buttonRect.top;

    if (isCompactViewport()) {
        left = buttonRect.left + (buttonRect.width / 2) - (panelWidth / 2);
        top = buttonRect.top - panelHeight - gap;

        if (top < 4) {
            top = buttonRect.bottom + gap;
        }
    } else if (left + panelWidth > window.innerWidth - 4) {
        left = buttonRect.left - panelWidth - gap;
    }

    left = clamp(left, 4, Math.max(4, window.innerWidth - panelWidth - 4));
    top = clamp(top, 4, Math.max(4, window.innerHeight - panelHeight - 4));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    if (wasHidden) {
        panel.style.visibility = '';
        panel.style.display = '';
    }
}

function clampButtonToViewport(savePosition = false) {
    const button = document.getElementById('user_outfit_button');
    if (!button) {
        return;
    }

    const rect = button.getBoundingClientRect();
    const left = clamp(rect.left, 0, Math.max(0, window.innerWidth - button.offsetWidth));
    const top = clamp(rect.top, 0, Math.max(0, window.innerHeight - button.offsetHeight));

    if (left !== rect.left || top !== rect.top || savePosition) {
        button.style.left = `${left}px`;
        button.style.top = `${top}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';

        if (savePosition) {
            const settings = getSettings();
            settings.triggerPos = { left, top };
            saveSettingsDebounced();
        }
    }

    placePanelNearButton();
}

function applySavedButtonPosition() {
    const button = document.getElementById('user_outfit_button');
    const savedPos = getSettings().triggerPos;

    if (!button || !savedPos || !Number.isFinite(savedPos.left) || !Number.isFinite(savedPos.top)) {
        return;
    }

    button.style.left = `${savedPos.left}px`;
    button.style.top = `${savedPos.top}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    clampButtonToViewport(true);
}

function onButtonPointerDown(event) {
    if (event.button !== 0 && event.pointerType !== 'touch') {
        return;
    }

    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    dragState = {
        dragging: true,
        movedEnough: false,
        suppressNextClick: false,
        startX: event.clientX,
        startY: event.clientY,
        baseLeft: rect.left,
        baseTop: rect.top,
    };

    button.style.touchAction = 'none';
    button.setPointerCapture?.(event.pointerId);
}

function onButtonPointerMove(event) {
    if (!dragState.dragging) {
        return;
    }

    const button = document.getElementById('user_outfit_button');
    if (!button) {
        return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.movedEnough && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
        dragState.movedEnough = true;
    }

    const left = clamp(dragState.baseLeft + deltaX, 0, Math.max(0, window.innerWidth - button.offsetWidth));
    const top = clamp(dragState.baseTop + deltaY, 0, Math.max(0, window.innerHeight - button.offsetHeight));

    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    placePanelNearButton();
}

function onButtonPointerEnd(event) {
    if (!dragState.dragging) {
        return;
    }

    const button = document.getElementById('user_outfit_button');
    dragState.dragging = false;

    if (button) {
        button.releasePointerCapture?.(event.pointerId);
        button.style.touchAction = '';

        if (dragState.movedEnough) {
            const rect = button.getBoundingClientRect();
            const settings = getSettings();
            settings.triggerPos = { left: rect.left, top: rect.top };
            saveSettingsDebounced();
            dragState.suppressNextClick = true;
            window.setTimeout(() => {
                dragState.suppressNextClick = false;
            }, 250);
        }
    }
}

function togglePanel(force) {
    const panel = $('#user_outfit_panel');
    const shouldShow = typeof force === 'boolean' ? force : !panel.hasClass('user_outfit_open');

    panel.toggleClass('user_outfit_open', shouldShow);

    if (shouldShow) {
        syncPanel();
        placePanelNearButton();

        if (!isCompactViewport()) {
            $('#user_outfit_top').trigger('focus');
        }
    }
}

function createUi() {
    if ($('#user_outfit_button').length) {
        return;
    }

    const button = $(`
        <button id="user_outfit_button" type="button" aria-label="User outfit" title="Add user outfit">
            <span class="user_outfit_icon" aria-hidden="true"></span>
        </button>
    `);

    const panel = $(`
        <div id="user_outfit_panel" aria-live="polite">
            <div class="user_outfit_header">
                <div id="user_outfit_title" class="user_outfit_title"></div>
                <button id="user_outfit_close" type="button" class="menu_button menu_button_icon" title="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="user_outfit_fields">
                <label for="user_outfit_top">
                    <span>Top</span>
                    <textarea id="user_outfit_top" class="text_pole user_outfit_field" rows="2" placeholder="black fitted turtleneck"></textarea>
                </label>
                <label for="user_outfit_bottom">
                    <span>Bottom</span>
                    <textarea id="user_outfit_bottom" class="text_pole user_outfit_field" rows="2" placeholder="high-waisted charcoal skirt"></textarea>
                </label>
                <label for="user_outfit_footwear">
                    <span>Footwear</span>
                    <textarea id="user_outfit_footwear" class="text_pole user_outfit_field" rows="2" placeholder="ankle boots"></textarea>
                </label>
                <label for="user_outfit_accessories">
                    <span>Accessories</span>
                    <textarea id="user_outfit_accessories" class="text_pole user_outfit_field" rows="2" placeholder="silver earrings, red scarf"></textarea>
                </label>
            </div>
            <div class="user_outfit_controls">
                <button id="user_outfit_clear" type="button" class="menu_button menu_button_icon" title="Clear outfit">
                    <i class="fa-solid fa-eraser"></i>
                    <span>Clear</span>
                </button>
            </div>
        </div>
    `);

    $('body').append(button, panel);

    button[0].addEventListener('pointerdown', onButtonPointerDown);
    window.addEventListener('pointermove', onButtonPointerMove);
    window.addEventListener('pointerup', onButtonPointerEnd);
    window.addEventListener('pointercancel', onButtonPointerEnd);
    window.addEventListener('resize', () => clampButtonToViewport(Boolean(getSettings().triggerPos)));
    button.on('click', (event) => {
        if (dragState.suppressNextClick) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        togglePanel();
    });
    $('#user_outfit_close').on('click', () => togglePanel(false));
    for (const field of OUTFIT_FIELDS) {
        $(`#user_outfit_${field.key}`).on('input', function () {
            setOutfitField(field.key, $(this).val());
        });
    }
    $('#user_outfit_clear').on('click', () => {
        clearOutfit();
        $('#user_outfit_top').trigger('focus');
    });

    applySavedButtonPosition();
}

function onPersonaChanged() {
    syncPanel();
}

export function init() {
    getSettings();
    createUi();
    syncPanel();

    eventSource.on(event_types.PERSONA_CHANGED, onPersonaChanged);
    eventSource.on(event_types.CHAT_CHANGED, syncPanel);
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, (_type, _meta, dryRun) => {
        if (dryRun) {
            return;
        }

        applyPersonaPatch('GENERATION_AFTER_COMMANDS');
    });
    eventSource.on(event_types.GENERATION_ENDED, () => restorePersonaPatch('GENERATION_ENDED'));
    eventSource.on(event_types.GENERATION_STOPPED, () => restorePersonaPatch('GENERATION_STOPPED'));
}
