/** Manage rounded-corner signals for the lifetime of each window. */
import { logDebug } from '../utils/log.js';
import { prefs } from '../utils/settings.js';
import * as handlers from './event_handlers.js';
import { activateActor, deactivateActor, isActorCurrent, isActorDestroyed,
    markActorDestroyed } from './actor_lifecycle.js';

const globalConnections = [];
const windows = new Map();
let enabled = false;

function connect(owner, object, signal, callback) {
    const connection = { object, id: object.connect(signal, callback) };
    owner.push(connection);
    return connection;
}

function disconnect(owner, connection) {
    const index = owner.indexOf(connection);
    if (index < 0)
        return;
    owner.splice(index, 1);
    connection.object.disconnect(connection.id);
}

function disconnectAll(owner, skip = new Set()) {
    for (const connection of owner.splice(0).reverse()) {
        // Signals on a disposing actor/texture are removed by Clutter itself.
        if (!skip.has(connection.object))
            connection.object.disconnect(connection.id);
    }
}

function prepareActor(actor, win = null) {
    if (!enabled || isActorDestroyed(actor))
        return null;
    if (windows.has(actor))
        return windows.get(actor);
    win ??= actor.metaWindow;
    if (!win)
        return null;
    const record = { actor, win, texture: null, signals: [],
        token: activateActor(actor), applied: false, classWait: null, childWait: null };
    windows.set(actor, record);
    connect(record.signals, actor, 'destroy', () => {
        markActorDestroyed(actor);
        removeEffectFrom(actor, true);
    });
    // Meta.Window becomes unmanaged before its native actor is disposed.
    connect(record.signals, win, 'unmanaged', () => removeEffectFrom(actor));
    return record;
}

export function enableEffect() {
    if (enabled)
        return;
    enabled = true;
    connect(globalConnections, prefs, 'changed', handlers.onSettingsChanged);
    const wm = global.windowManager;
    const actors = global.get_window_actors();
    logDebug(`Initial window count: ${actors.length}`);
    for (const actor of actors)
        applyEffectTo(actor);
    connect(globalConnections, global.display, 'window-created', (_, win) => {
        const actor = win.get_compositor_private();
        if (prepareActor(actor, win))
            applyEffectTo(actor);
    });
    connect(globalConnections, wm, 'minimize', (_, actor) => {
        if (isActorCurrent(actor))
            handlers.onMinimize(actor);
    });
    connect(globalConnections, wm, 'unminimize', (_, actor) => {
        if (isActorCurrent(actor))
            handlers.onUnminimize(actor);
    });
    connect(globalConnections, wm, 'destroy', (_, actor) => removeEffectFrom(actor));
    connect(globalConnections, global.display, 'restacked', handlers.onRestacked);
}

export function disableEffect() {
    enabled = false;
    // Include windows still waiting for wm-class or their first child.
    for (const actor of [...windows.keys()])
        removeEffectFrom(actor);
    disconnectAll(globalConnections);
}

function applyEffectTo(actor) {
    const record = prepareActor(actor);
    if (!record || record.applied || !isActorCurrent(actor, record.token))
        return;
    const { win } = record;
    if (win.wmClass === null) {
        if (!record.classWait) {
            record.classWait = connect(record.signals, win, 'notify::wm-class', () => {
                if (!isActorCurrent(actor, record.token) || win.wmClass === null)
                    return;
                disconnect(record.signals, record.classWait);
                record.classWait = null;
                applyEffectTo(actor);
            });
        }
        return;
    }
    if (!actor.firstChild) {
        if (!record.childWait) {
            record.childWait = connect(record.signals, actor, 'notify::first-child', () => {
                if (!isActorCurrent(actor, record.token) || !actor.firstChild)
                    return;
                disconnect(record.signals, record.childWait);
                record.childWait = null;
                applyEffectTo(actor);
            });
        }
        return;
    }
    const texture = actor.get_texture();
    if (!texture)
        return;
    record.texture = texture;
    record.applied = true;
    const guarded = handler => () => {
        // Check JS lifecycle state before touching any native actor property.
        if (isActorCurrent(actor, record.token))
            handler(actor);
    };
    connect(record.signals, actor, 'notify::size', guarded(handlers.onSizeChanged));
    connect(record.signals, texture, 'size-changed', guarded(handlers.onSizeChanged));
    connect(record.signals, win, 'notify::fullscreen', guarded(handlers.onSizeChanged));
    connect(record.signals, win, 'notify::appears-focused', guarded(handlers.onFocusChanged));
    connect(record.signals, win, 'workspace-changed', guarded(handlers.onFocusChanged));
    handlers.onAddEffect(actor);
}

function removeEffectFrom(actor, destroyed = false) {
    const record = windows.get(actor);
    if (!record)
        return;
    windows.delete(actor);
    deactivateActor(actor); // Invalidates queued work, including work awaiting a Promise.
    try {
        handlers.onRemoveEffect(actor, destroyed);
    } finally {
        const skip = destroyed ? new Set([actor, record.texture]) : new Set();
        disconnectAll(record.signals, skip);
    }
}
