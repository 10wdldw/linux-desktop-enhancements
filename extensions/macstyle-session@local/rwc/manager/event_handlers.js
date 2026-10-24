/**
 * @file Contains the implementation of handlers for various events that need
 * to be processed by the extension. Those handlers are bound to event signals
 * in effect_manager.ts.
 */
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { ClipShadowEffect } from '../effect/clip_shadow_effect.js';
import { RoundedCornersEffect } from '../effect/rounded_corners_effect.js';
import { CLIP_SHADOW_EFFECT, ROUNDED_CORNERS_EFFECT, } from '../utils/constants.js';
import { logDebug } from '../utils/log.js';
import { getPref } from '../utils/settings.js';
import { actorToken, isActorCurrent } from './actor_lifecycle.js';
import { computeBounds, computeShadowActorOffset, computeWindowContentsOffset, getRoundedCornersCfg, getRoundedCornersEffect, isChromium, shouldEnableEffect, unwrapActor, updateShadowActorStyle, } from './utils.js';
/**
 * Per-window shadow actor. Off in this build: updateShadowActorStyle() gives its
 * child `background: transparent; box-shadow: none` and ignores the shadow
 * settings, so the actor paints nothing - yet it costs a second window-sized
 * offscreen shader pass (ClipShadowEffect), two St.Bins, four constraints and
 * six property bindings per window. Set to true to get the original behaviour back.
 */
const SHADOW_ACTOR_ENABLED = false;
/**
 * Per-actor queue lock to run event handlers one after another and avoid
 * needlessly refreshing the effect a lot of times.
 */
const actorQueues = new WeakMap();
function withActorLock(actor, fn) {
    const token = actorToken(actor);
    if (!isActorCurrent(actor, token))
        return Promise.resolve();
    const run = () => isActorCurrent(actor, token) ? fn(token) : undefined;
    const prev = actorQueues.get(actor);
    const next = (prev ? prev.then(run, run) : Promise.resolve().then(run))
        .catch(error => logError(error, 'MacStyle rounded corners'));
    actorQueues.set(actor, next);
    next.then(() => {
        if (actorQueues.get(actor) === next)
            actorQueues.delete(actor);
    });
    return next;
}
export function onAddEffect(actor) {
    return withActorLock(actor, async token => {
        logDebug(`Adding effect to ${actor?.metaWindow.wmClass}`);
        const win = actor.metaWindow;
        // Skip windows that already have the effect to prevent a memory leak
        const shouldHaveEffect = await shouldEnableEffect(win);
        if (!isActorCurrent(actor, token))
            return;
        const effect = getRoundedCornersEffect(actor);
        const hasEffect = effect && actor.rwcCustomData;
        if (!shouldHaveEffect || hasEffect) {
            logDebug(`Skipping ${win.wmClass}`);
            return;
        }
        createEffect(actor);
    });
}
/**
 * Create the effect on an actor.
 *
 * @param actor - The window actor to create the effect on.
 */
function createEffect(actor) {
    if (!isActorCurrent(actor))
        return;
    unwrapActor(actor)?.add_effect_with_name(ROUNDED_CORNERS_EFFECT, new RoundedCornersEffect());
    const shadow = SHADOW_ACTOR_ENABLED ? createShadow(actor) : null;
    // Bind properties of the window to the shadow actor.
    const propertyBindings = [];
    for (const prop of shadow ? [
        'pivot-point',
        'translation-x',
        'translation-y',
        'scale-x',
        'scale-y',
        'visible',
    ] : []) {
        const binding = actor.bind_property(prop, shadow, prop, GObject.BindingFlags.SYNC_CREATE);
        propertyBindings.push(binding);
    }
    // Store shadow, app type, visible binding, so that we can access them later
    actor.rwcCustomData = {
        shadow,
        unminimizedTimeoutId: 0,
        propertyBindings,
        animationSignals: [],
    };
    // Make sure the effect is applied correctly.
    updateEffect(actor);
}
export function onRemoveEffect(actor, destroyed = false) {
    const name = ROUNDED_CORNERS_EFFECT;
    if (!destroyed)
        unwrapActor(actor)?.remove_effect_by_name(name);
    for (const { source, id } of actor.rwcCustomData?.animationSignals || [])
        source.disconnect(id);
    // Unbind all properties
    for (const binding of actor.rwcCustomData?.propertyBindings || []) {
        binding.unbind();
    }
    // Remove shadow actor
    const shadow = actor.rwcCustomData?.shadow;
    if (shadow) {
        shadow.get_constraints().forEach(constraint => {
            shadow.remove_constraint(constraint);
        });
        global.windowGroup.remove_child(shadow);
        shadow.clear_effects();
        shadow.destroy();
    }
    // Remove all timeout handler
    const timeoutId = actor.rwcCustomData?.unminimizedTimeoutId;
    if (timeoutId) {
        GLib.source_remove(timeoutId);
    }
    delete actor.rwcCustomData;
}
export function onMinimize(actor) {
    if (!isActorCurrent(actor))
        return;
    // Compatibility with "Compiz alike magic lamp effect".
    // When minimizing a window, disable the shadow to make the magic lamp effect
    // work.
    const magicLampEffect = actor.get_effect('minimize-magic-lamp-effect');
    const shadow = actor.rwcCustomData?.shadow;
    const roundedCornersEffect = getRoundedCornersEffect(actor);
    if (magicLampEffect && shadow && roundedCornersEffect) {
        logDebug('Minimizing with magic lamp effect');
        shadow.visible = false;
        roundedCornersEffect.enabled = false;
    }
}
export async function onUnminimize(actor) {
    const token = actorToken(actor);
    if (!isActorCurrent(actor, token))
        return;
    // Compatibility with "Compiz alike magic lamp effect".
    // When unminimizing a window, wait until the effect is completed before
    // showing the shadow.
    const magicLampEffect = actor.get_effect('unminimize-magic-lamp-effect');
    const shadow = actor.rwcCustomData?.shadow;
    const roundedCornersEffect = getRoundedCornersEffect(actor);
    if (magicLampEffect && shadow && roundedCornersEffect) {
        shadow.visible = false;
        const timer = magicLampEffect.timerId;
        const id = timer.connect('new-frame', source => {
            if (!isActorCurrent(actor, token))
                return;
            // Wait until the effect is 98% completed
            if (source.get_progress() > 0.98) {
                logDebug('Unminimizing with magic lamp effect');
                shadow.visible = true;
                roundedCornersEffect.enabled = true;
                source.disconnect(id);
                actor.rwcCustomData.animationSignals = actor.rwcCustomData.animationSignals
                    .filter(signal => signal.id !== id || signal.source !== source);
            }
        });
        actor.rwcCustomData.animationSignals.push({ source: timer, id });
    }
    // Chromium has a bug where windows are sometimes unminimized to the
    // wrong location, and then move to the correct position shortly after.
    // This forces an effect refresh after the window has already moved to the
    // proper position; otherwise, the effect bounds would use the wrong one and
    // cut off a part of the window.
    //
    // See https://github.com/flexagoon/rounded-window-corners/issues/124
    const chromium = await isChromium(actor.metaWindow);
    if (!isActorCurrent(actor, token))
        return;
    if (chromium && actor.rwcCustomData !== undefined) {
        const oldTimeout = actor.rwcCustomData.unminimizedTimeoutId;
        if (oldTimeout !== 0)
            GLib.source_remove(oldTimeout);
        actor.rwcCustomData.unminimizedTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            if (isActorCurrent(actor, token) && actor.rwcCustomData) {
                actor.rwcCustomData.unminimizedTimeoutId = 0;
                refreshRoundedCorners(actor);
            }
            return GLib.SOURCE_REMOVE;
        });
    }
}
export function onRestacked() {
    if (!SHADOW_ACTOR_ENABLED)
        return;
    for (const actor of global.get_window_actors()) {
        if (!isActorCurrent(actor))
            continue;
        const shadow = actor.rwcCustomData?.shadow;
        if (!(actor.visible && shadow)) {
            continue;
        }
        global.windowGroup.set_child_below_sibling(shadow, actor);
    }
}
export const onSizeChanged = refreshRoundedCorners;
export const onFocusChanged = refreshShadow;
export const onSettingsChanged = refreshAllRoundedCorners;
/**
 * Create the shadow actor for a window.
 *
 * @param actor - The window actor to create the shadow actor for.
 */
function createShadow(actor) {
    const shadow = new St.Bin({
        name: 'Shadow Actor',
        child: new St.Bin({
            xExpand: true,
            yExpand: true,
        }),
    });
    shadow.firstChild.add_style_class_name('shadow');
    refreshShadow(actor);
    // We have to clip the shadow because of this issue:
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/4474
    shadow.add_effect_with_name(CLIP_SHADOW_EFFECT, new ClipShadowEffect());
    // Draw the shadow actor below the window actor.
    global.windowGroup.insert_child_below(shadow, actor);
    // Bind position and size between window and shadow
    for (let i = 0; i < 4; i++) {
        const constraint = new Clutter.BindConstraint({
            source: actor,
            coordinate: i,
            offset: 0,
        });
        shadow.add_constraint(constraint);
    }
    return shadow;
}
/**
 * Refresh the shadow actor for a window.
 *
 * @param actor - The window actor to refresh the shadow for.
 */
function refreshShadow(actor) {
    if (!SHADOW_ACTOR_ENABLED || !isActorCurrent(actor))
        return;
    const shadow = actor.rwcCustomData?.shadow;
    if (!shadow)
        return;
    const win = actor.metaWindow;
    const shadowSettings = win.appears_focused
        ? getPref('focused-shadow')
        : getPref('unfocused-shadow');
    const { borderRadius, padding } = getRoundedCornersCfg(win);
    updateShadowActorStyle(win, shadow, borderRadius, shadowSettings, padding);
}
/**
 * Refresh rounded corners state and settings for a window.
 *
 * @param actor - The window actor to refresh the rounded corners settings for.
 */
function refreshRoundedCorners(actor) {
    return withActorLock(actor, async token => {
        const win = actor.metaWindow;
        const shouldHaveEffect = await shouldEnableEffect(win);
        if (!isActorCurrent(actor, token))
            return;
        const windowInfo = actor.rwcCustomData;
        const effect = getRoundedCornersEffect(actor);
        const hasEffect = effect && windowInfo;
        // onAddEffect already skips windows that shouldn't have rounded corners.
        // This if statement is just for code readability to match the check for
        // onRemoveEffect below.
        if (!hasEffect && shouldHaveEffect) {
            createEffect(actor);
            // createEffect already calls updateEffect at the end,
            // so return here to avoid running the update twice.
            return;
        }
        if (hasEffect && !shouldHaveEffect) {
            onRemoveEffect(actor);
            return;
        }
        // Don'd do anything when the window doesn't have the effect and shouldn't have it.
        if (!hasEffect)
            return;
        updateEffect(actor);
    });
}
/**
 * Update effect uniforms and constraints for a window.
 *
 * @param actor - The window actor to update the effect for.
 */
function updateEffect(actor) {
    if (!isActorCurrent(actor))
        return;
    const windowInfo = actor.rwcCustomData;
    if (!windowInfo)
        return;
    const win = actor.metaWindow;
    const effect = getRoundedCornersEffect(actor);
    if (!effect)
        return;
    if (!effect.enabled) {
        effect.enabled = true;
    }
    const cfg = getRoundedCornersCfg(win);
    const windowContentOffset = computeWindowContentsOffset(win);
    effect.updateUniforms(cfg, computeBounds(actor, windowContentOffset));
    const shadow = windowInfo.shadow;
    if (!shadow)
        return;
    const offsets = computeShadowActorOffset(windowContentOffset);
    const constraints = shadow.get_constraints();
    constraints.forEach((constraint, i) => {
        if (constraint instanceof Clutter.BindConstraint) {
            constraint.offset = offsets[i];
        }
    });
    refreshShadow(actor);
}
/** Refresh rounded corners settings for all windows. */
function refreshAllRoundedCorners() {
    for (const actor of global.get_window_actors()) {
        if (isActorCurrent(actor)) {
            refreshRoundedCorners(actor);
        }
    }
}
