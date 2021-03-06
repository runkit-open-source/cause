const { List, Map, ...I } = require("immutable");
const Record = require("./record");
const LNode = require("./lnode");
const KeyPath = require("./key-path");
const algebraic = require("@algebraic/type");

const DescendentEvent = algebraic.data `DescendentEvent` (
    event       => Object,
    fromKeyPath => LNode);

const Event = typename => (fields, name) =>
    Record(fields, `${typename}.${name}`);
const fromMaybeTemplate = input =>
    Array.isArray(input) ? input.length > 1 ? input : input[0] : input;
const isString = object => typeof object === "string";
const type = record => Object.getPrototypeOf(record).constructor;
const ANY_STATE = { };


Cause.Start = Event("Cause")({ }, "Start");
Cause.Finished = Event("Cause")({ value: 10 }, "Finished");
Cause.Ready = Event("Cause")({ }, "Ready");
Cause.Ready.is = cause =>
    !(cause instanceof I.Record) ||
    !cause.has("ready") || cause.ready;
Cause.Ready.are = causes =>
    causes.length <= 0 ||
    causes.every(Cause.Ready.is);

module.exports = Object.assign(Cause,
{
    Cause,
    field: declaration("field", "name"),
    event:
    {
        ignore: (state, event) => [state, []],
        passthrough: (state, event, fromKeyPath) =>
            [state, [DescendentEvent({ event, fromKeyPath })]],
        in: declaration("event.in", "name"),
        out: declaration("event.out", "name"),
        on: declaration("event.on", "on", { from:-1 }),
        from: declaration("event.on", "from"),
        _on: function (type)
        {
            return JSON.stringify({ kind:"event.on", on: { UUID: algebraic.getUUID(type) } });
        }
    },
    state: declaration("state", "name")
});

module.exports.update = require("./update");
module.exports.IO = require("./io");

function Cause(nameOrArray, declarations)
{
    if (arguments.length < 2)
        return declarations => Cause(nameOrArray, declarations);

    const typename = fromMaybeTemplate(nameOrArray);
    const definitions = getDefinitions(declarations);

    const init = declarations["init"];
    const create = (...args) =>
        type(...(init ? [init(...args)] : args));
    const fields = definitions.toObject("field");
    const eventsIn = definitions.toObject("event.in", Event(typename));
    const eventsOut = definitions.toObject("event.out", Event(typename));
    const type = Record(fields, typename);
    const update = toCauseUpdate(eventsIn, definitions);

    return Object.assign(type, { create, update }, eventsIn, eventsOut);
}

function getDefinitions(declarations)
{
    const definitions = List(Object.keys(declarations))
        .filter(key => key.charAt(0) === "{")
        .map(key => [JSON.parse(key), declarations[key]])
        .groupBy(([{ kind }]) => kind);
    const toMap = (key, transform = x => x) =>
        Map((definitions.get(key) || List())
            .map(([parsed, value]) =>
                [parsed.name, transform(value, parsed.name)]));
    const toObject = (key, transform = x => x) =>
        toMap(key, transform).toObject();
    const get = (key, missing) => definitions.get(key, missing);

    return { toMap, toObject, get };
}

function toCauseUpdate(eventsIn, definitions)
{
    const stateless =
        toEventDescriptions(eventsIn, ANY_STATE, definitions);
    // We .toList since Seq size returns undefined after flattening.
    // https://github.com/facebook/immutable-js/issues/1585
    const stateful = definitions.toMap("state", (value, name) =>
        toEventDescriptions(eventsIn, name, getDefinitions(value)))
        .valueSeq().flatten().toList();
    const handlers = stateful.concat(stateless);
    const hasStatefulUpdates = stateful.size > 0;

    return function update(state, event, fromKeyPath)
    {
        if (algebraic.is(DescendentEvent, event))
            return update(state,
                event.event,
                KeyPath.concat(fromKeyPath, event.fromKeyPath));

        const etype = type(event);
        const matches = on =>
            on === false || (!!on.UUID ?
                algebraic.is(algebraic.getTypeWithUUID(on.UUID), event) :
                on.id === etype.id);
        const match = handlers.find(({ on, from, inState }) =>
            matches(on) &&
            (!from || KeyPath.equal(fromKeyPath, from)) &&
            (inState === ANY_STATE || state.state === inState));

        if (!match)
        {
            const rname = type(state).name;
            const ename = etype.name;
            const inStateMessage = hasStatefulUpdates ?
                ` in state ${state.state}` : "";
            const fromMessage = fromKeyPath ? ` from ${fromKeyPath}` : "";
            const details = `${inStateMessage}${fromMessage}`;

            throw Error(
                `${rname} does not respond to ${ename}${details}`);
        }

        const result = match.update(state, event, fromKeyPath);

        return Array.isArray(result) ? result : [result, []];
    }
}

function toEventDescriptions(eventsIn, inState, definitions)
{
    return definitions
        .get("event.on", List())
        .map(([{ on, from, name }, update]) =>
        ({
            name, update, inState,
            on: (!!on && on !== "*") &&
                (isString(on) ? eventsIn[on] : on),
            from: !!from && KeyPath.from(from)
        }));
}

function declaration(previous, key, routes = { })
{
    const rest = isString(previous) ?
        { kind: previous } : previous;
    const toObject = value =>
        ({ ...rest, [key]: value instanceof Function ?
            { id: value.id, name: value.name } :
            fromMaybeTemplate(value) });
    const f = value => ensure(key, value) && Object.keys(routes)
        .reduce((object, key) => Object.assign(object,
            { [key]: declaration(toObject(value), key, routes[key]) }),
            { toString: () => JSON.stringify(toObject(value)) });

    return Object.assign(f, f(false));
}

function ensure(key, value)
{
    if (value === void 0)
        throw SyntaxError(`Undefined passed to "${key}"`);

    return true;
}
