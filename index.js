import {
    event_types,
    eventSource,
    is_send_press,
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
    enabled: true,
    outfits: {},
};

let patchState = {
    active: false,
    snapshot: null,
    patchedDescription: '',
    personaKey: '',
    abortWatcher: null,
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

        if (!is_send_press) {
            restorePersonaPatch('generation unblocked');
        }
    }, 500);
}

function applyPersonaPatch(reason) {
    if (patchState.active || !getSettings().enabled) {
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
    const enabled = Boolean(getSettings().enabled);
    $('#user_outfit_button')
        .toggleClass('user_outfit_has_value', outfitHasValue)
        .toggleClass('user_outfit_disabled', !enabled)
        .attr('title', outfitHasValue ? 'Edit user outfit' : 'Add user outfit');
}

function syncPanel() {
    const settings = getSettings();
    const outfit = getOutfit();
    $('#user_outfit_enabled').prop('checked', settings.enabled);
    for (const field of OUTFIT_FIELDS) {
        $(`#user_outfit_${field.key}`).val(outfit[field.key] || '');
    }
    $('#user_outfit_persona_name').text(getPersonaName());
    updateButtonState();
}

function togglePanel(force) {
    const panel = $('#user_outfit_panel');
    const shouldShow = typeof force === 'boolean' ? force : !panel.hasClass('user_outfit_open');

    panel.toggleClass('user_outfit_open', shouldShow);

    if (shouldShow) {
        syncPanel();
        $('#user_outfit_top').trigger('focus');
    }
}

function createUi() {
    if ($('#user_outfit_button').length) {
        return;
    }

    const button = $(`
        <button id="user_outfit_button" type="button" aria-label="User outfit" title="Add user outfit">
            <i class="fa-solid fa-shirt"></i>
        </button>
    `);

    const panel = $(`
        <div id="user_outfit_panel" aria-live="polite">
            <div class="user_outfit_header">
                <div>
                    <div class="user_outfit_title">User Outfit</div>
                    <div id="user_outfit_persona_name" class="user_outfit_persona"></div>
                </div>
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
                <label class="checkbox_label" for="user_outfit_enabled">
                    <input id="user_outfit_enabled" type="checkbox" />
                    <span>Inject into persona</span>
                </label>
                <button id="user_outfit_clear" type="button" class="menu_button menu_button_icon" title="Clear outfit">
                    <i class="fa-solid fa-eraser"></i>
                    <span>Clear</span>
                </button>
            </div>
        </div>
    `);

    $('body').append(button, panel);

    button.on('click', () => togglePanel());
    $('#user_outfit_close').on('click', () => togglePanel(false));
    for (const field of OUTFIT_FIELDS) {
        $(`#user_outfit_${field.key}`).on('input', function () {
            setOutfitField(field.key, $(this).val());
        });
    }
    $('#user_outfit_enabled').on('input', function () {
        const settings = getSettings();
        settings.enabled = Boolean($(this).prop('checked'));
        saveSettingsDebounced();
        updateButtonState();
    });
    $('#user_outfit_clear').on('click', () => {
        clearOutfit();
        $('#user_outfit_top').trigger('focus');
    });
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
