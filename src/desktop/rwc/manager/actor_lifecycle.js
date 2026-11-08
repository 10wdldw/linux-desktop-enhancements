/** Keep native actor access behind a live, managed window generation. */
const active = new WeakMap();
const destroyed = new WeakSet();

export function activateActor(actor) {
    if (!actor || destroyed.has(actor))
        return undefined;
    const token = {};
    active.set(actor, token);
    return token;
}

export function deactivateActor(actor) {
    active.delete(actor);
}

export function markActorDestroyed(actor) {
    destroyed.add(actor);
    deactivateActor(actor);
}

export function isActorDestroyed(actor) {
    return !actor || destroyed.has(actor);
}

export function actorToken(actor) {
    return actor ? active.get(actor) : undefined;
}

export function isActorCurrent(actor, token = actorToken(actor)) {
    return token !== undefined && active.get(actor) === token && !destroyed.has(actor);
}
