import {
    event_types,
    eventSource,
    extension_prompt_roles,
    extension_prompt_types,
    name1,
    saveSettingsDebounced,
    setExtensionPrompt,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { user_avatar } from '../../../personas.js';

const MODULE_NAME = 'user_outfit';
const DEFAULT_PERSONA_KEY = '__default__';

const defaultSettings = {
    enabled: true,
    outfits: {},
    template: '{{user}} is currently wearing: {{outfit}}',
    position: extension_prompt_types.IN_PROMPT,
    depth: 4,
    role: extension_prompt_roles.SYSTEM,
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

function getOutfit() {
    const settings = getSettings();
    return settings.outfits[getPersonaKey()] || '';
}

function setOutfit(value) {
    const settings = getSettings();
    const key = getPersonaKey();
    const outfit = String(value || '').trim();

    if (outfit) {
        settings.outfits[key] = outfit;
    } else {
        delete settings.outfits[key];
    }

    saveSettingsDebounced();
    updatePrompt();
    updateButtonState();
}

function formatPrompt(outfit) {
    const settings = getSettings();
    return String(settings.template || defaultSettings.template)
        .replaceAll('{{user}}', getPersonaName())
        .replaceAll('{{outfit}}', outfit);
}

function updatePrompt() {
    const settings = getSettings();
    const outfit = getOutfit();
    const prompt = settings.enabled && outfit ? formatPrompt(outfit) : '';

    setExtensionPrompt(
        MODULE_NAME,
        prompt,
        settings.position,
        settings.depth,
        false,
        settings.role,
    );
}

function updateButtonState() {
    const hasOutfit = Boolean(getOutfit());
    const enabled = Boolean(getSettings().enabled);
    $('#user_outfit_button')
        .toggleClass('user_outfit_has_value', hasOutfit)
        .toggleClass('user_outfit_disabled', !enabled)
        .attr('title', hasOutfit ? 'Edit user outfit' : 'Add user outfit');
}

function syncPanel() {
    const settings = getSettings();
    $('#user_outfit_enabled').prop('checked', settings.enabled);
    $('#user_outfit_text').val(getOutfit());
    $('#user_outfit_persona_name').text(getPersonaName());
    updateButtonState();
}

function togglePanel(force) {
    const panel = $('#user_outfit_panel');
    const shouldShow = typeof force === 'boolean' ? force : !panel.hasClass('user_outfit_open');

    panel.toggleClass('user_outfit_open', shouldShow);

    if (shouldShow) {
        syncPanel();
        $('#user_outfit_text').trigger('focus');
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
            <textarea id="user_outfit_text" class="text_pole" rows="5" placeholder="black turtleneck, silver earrings, long red coat..."></textarea>
            <div class="user_outfit_controls">
                <label class="checkbox_label" for="user_outfit_enabled">
                    <input id="user_outfit_enabled" type="checkbox" />
                    <span>Inject into prompt</span>
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
    $('#user_outfit_text').on('input', function () {
        setOutfit($(this).val());
    });
    $('#user_outfit_enabled').on('input', function () {
        const settings = getSettings();
        settings.enabled = Boolean($(this).prop('checked'));
        saveSettingsDebounced();
        updatePrompt();
        updateButtonState();
    });
    $('#user_outfit_clear').on('click', () => {
        $('#user_outfit_text').val('').trigger('input').trigger('focus');
    });
}

function onPersonaChanged() {
    syncPanel();
    updatePrompt();
}

export function init() {
    getSettings();
    createUi();
    syncPanel();
    updatePrompt();

    eventSource.on(event_types.PERSONA_CHANGED, onPersonaChanged);
    eventSource.on(event_types.CHAT_CHANGED, updatePrompt);
}
